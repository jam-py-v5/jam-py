import consts from "./consts.js";
import AbsrtactItem from "./abstr_item.js";
import Group from "./group.js";
import {Item, Detail} from "./item.js";
import ModalForms from "./modals.js";
import Report from "./report.js";

class Task extends AbsrtactItem {
    constructor(item_name, caption) {
        super(undefined, 0, item_name, caption, true);
        this.consts = consts;
        this.task = this;
        this.media = 0;
        this.user_info = {};
        this._grid_id = 0;
        this._edited_items = [];
        this.events = {};
        this.modals = new ModalForms(this);
        this.form_options = {
            left: undefined,
            top: undefined,
            title: '',
            fields: [],
            form_header: true,
            form_border: true,
            close_button: true,
            close_on_escape: true,
            close_focusout: false,
            print: false,
            width: 0,
            tab_id: '',
            minimize_buttons: false
        };
        this.edit_options = $.extend({}, this.form_options, {
            history_button: true,
            edit_details: [],
            detail_height: 0,
            buttons_on_top: false,
            modeless: false,
            in_well: false
        });
        this.view_options = $.extend({}, this.form_options, {
            history_button: true,
            refresh_button: true,
            enable_search: true,
            search_field: undefined,
            enable_filters: true,
            view_detail: undefined,
            detail_height: 0,
            buttons_on_top: false
        });
        this.table_options = {
            multiselect: false,
            dblclick_edit: true,
            height: 0,
            striped: false,
            row_count: 0,
            row_line_count: 1,
            title_line_count: 1,
            expand_selected_row: 0,
            freeze_count: 0,
            sort_fields: [],
            edit_fields: [],
            summary_fields: [],
            update_summary_after_apply: false
        };
        this.constructors = {
            task: Task,
            group: Group,
            item: Item,
            detail: Detail
        };
        let self = this;
        this.detect_device();
    }

    getChildClass() {
        return Group;
    }

    detect_device() {
        let width = window.screen.availWidth;
        if (width < 768) {
            this.media = 2;
        }
        else if (width >= 768 && width < 992) {
            this.media = 1;
        }
        else {
            this.media = 0;
        }
    }

    process_request(request, item, params, callback) {
        var self = this,
            date = new Date().getTime(),
            async = false,
            statusCode = {},
            contentType = "application/json;charset=utf-8",
            reply;

        if (callback) {
            async = true;
        }
        if (this.ajaxStatusCode) {
            statusCode = this.ajaxStatusCode;
        }

        $.ajax({
            url: "api",
            type: "POST",
            contentType: contentType,
            async: async,
            cache: false,
            data: JSON.stringify([request, this.ID, item.ID, params, self.modification]),
            statusCode: statusCode,
            success: function(data) {
                var mess;
                if (data.result.status === consts.RESPONSE || data.error) {
                    if (data.error) {
                        console.error(data.error);
                    }
                    if (callback) {
                        callback.call(item, data.result.data);
                    } else {
                        reply = data.result.data;
                    }
                } else {
                    if (data.result.status === consts.PROJECT_NOT_LOGGED) {
                        location.reload();
                    } else if (self.ID && data.result.status === consts.PROJECT_MODIFIED) {
                        if (!self.task._version_changed) {
                            self.task._version_changed = true;
                            self.message('<h5 class="text-primary">' + task.language.version_changed + '</h5>', {
                                margin: "2rem 4rem",
                                width: "36rem",
                                text_center: true
                            });
                        }
                        return;
                    } else if (data.result.status === consts.PROJECT_MAINTAINANCE) {
                        if (!self._under_maintainance) {
                            self._under_maintainance = true;
                            if (task.language) {
                                mess = task.language.website_maintenance;
                            } else {
                                mess = 'Web site currently under maintenance.';
                            }
                            item.warning(mess, function() {
                                self._under_maintainance = undefined;
                            });
                        }
                        setTimeout(function() { self.load() }, 1000);
                        return;
                    }
                }
            },
            error: function(jqXHR, textStatus, errorThrown) {
                if (jqXHR.responseText && self.ID !== 0) {
                    document.open();
                    document.write(jqXHR.responseText);
                    document.close();
                } else if (task.language) {
                    task.alert_error(task.language.server_request_error);
                    if (callback) {
                        callback.call(item, [null, task.language.server_request_error]);
                    }
                }
            },
            fail: function(jqXHR, textStatus, errorThrown) {
                console.log('ajax fail: ', jqXHR, textStatus, errorThrown);
            }
        });
        if (reply !== undefined) {
            return reply;
        }
    }

    upload_file(options, form, event) {
        var xhr = new XMLHttpRequest(),
            formData = new FormData(form.get(0)),
            self = this,
            message;
        if (options.blob) {
            formData.append("myfile", options.blob);
        } else {
            formData.append("file", options.blob);
        }
        formData.append("file_name", options.file_name);
        formData.append("path", options.path);
        formData.append("task_id", self.ID);
        formData.append("item_id", options.item_id);
        formData.append("field_id", options.field_id);
        xhr.open('POST', 'upload', true);
        if (options.callback) {
            xhr.onload = function(e) {
                var response,
                    data;
                if (e.currentTarget.status === 200) {
                    response = JSON.parse(e.currentTarget.response);
                    if (response.error) {
                        self.alert_error(response.error, {duration: 10});
                    }
                    else if (options.callback) {
                        data = response.result.data;
                        options.callback.call(self, data.file_name, options.file_name, data.path);
                    }
                }
                else {
                    self.alert_error(e.currentTarget.statusText, {duration: 10})
                    if (message) {
                        self.hide_message(message);
                    }
                }
            };
        }
        if (options.show_progress) {
            xhr.upload.onprogress = function(e) {
                var percent,
                    pb =
                    '<div class="progress">' +
                        '<div class="bar" style="width: 0%;"></div>' +

                    '</div>' +
                    '<div class="percent text-center"></div>';
                if (e.loaded === e.total) {
                    if (message) {
                        self.hide_message(message);
                    }
                }
                else {
                    if (!message) {
                        message = self.message(pb,
                            {margin: "20px 20px", text_center: true, width: 500});
                    }
                    else {
                        percent = parseInt(100 * e.loaded / e.total, 10) + '%';
                        message.find('.bar').width(percent);
                        message.find('.percent').html('<b>' + percent + '</b>');
                    }
                }
            }
        }

        if (event) {
            event.preventDefault();
        }
        xhr.send(formData);
    }

    upload() {
        var self = this,
            args = this._check_args(arguments),
            options = args['object'],
            path = args['string'],
            default_options = {
                callback: undefined,
                show_progress: true,
                accept: undefined,
                blob: undefined,
                file_name: undefined,
                item_id: -1,
                field_id: -1
            },
            accept = '',
            form,
            file,
            button,
            submit_button;

        options = $.extend({}, default_options, options);
        if (options.accept) {
            accept = 'accept="' + options.accept + '"';
        }
        if (path === undefined) {
            path = '';
        }
        options.path = path;
        $('body').find('#upload-file-form').remove();
        if (options.blob) {
            form = $(
                '<form id="upload-file-form" enctype="multipart/form-data" method="post" style="position: absolute; top: -1000px; z-index: 10000;">' +
                    '<input id="inp-btn" name="myfile" ' + accept + ' required />' +
                    '<input id="submit-btn" type="submit" value="Submit" />' +
                '</form>'
            );
        }
        else {
            form = $(
                '<form id="upload-file-form" enctype="multipart/form-data" method="post" style="position: absolute; top: -1000px; z-index: 10000;">' +
                    '<input id="inp-btn" type="file" name="file" ' + accept + ' required />' +
                    '<input id="submit-btn" type="submit" value="Submit" />' +
                '</form>'
            );
        }
        button = form.find('#inp-btn');
        submit_button = form.find('#submit-btn');
        $('body').append(form);
        if (options.blob) {
            self.upload_file(options, form);
            form.remove();
        }
        else {
            button.on('change', function(e) {
                options.file_name = e.target.files[0].name;
                submit_button.submit();
            });
        }
        submit_button.on('submit', function(e) {
            self.upload_file(options, form, e);
            form.remove();
        })
        button.click();
    }

    logout() {
        if (this.ID === 0) {
            this.send_request('logout', undefined, function() {
                location.reload();
            });
        }
        else {
            location.href = '/logout';
        }
    }

    load(callback) {
        var self = this,
            info;
        this.send_request('load', null, function(data) {
            if (self._loaded) {
                return;
            }
            self._loaded = true;
            var info = data[0],
                error = data[1],
                templates;
            if (error) {
                self.warning(error);
                return;
            }
            self.language = info.language;
            self.locale = info.locale;
            self.settings = info.settings;
            self.user_info = info.user_info;
            self.user_privileges = info.privileges;
            self.consts = consts;
            self.safe_mode = self.settings.SAFE_MODE;
            self.forms_in_tabs = self.settings.FORMS_IN_TABS;
            self.full_width = self.settings.FULL_WIDTH;
            self.small_font = self.settings.SMALL_FONT;
            self.version = self.settings.VERSION;
            self.modification = self.settings.MODIFICATION;
            self.ID = info.task.id;
            self.item_name = info.task.name;
            self.item_caption = info.task.caption;
            self.visible = info.task.visible;
            self.lookup_lists = info.task.lookup_lists;
            self.history_item = info.task.history_item;
            self.item_type = "";
            if (info.task.type) {
                self.item_type = self.types[info.task.type - 1];
            }
            if (info.task.js_filename) {
                self.js_filename = 'js/' + info.task.js_filename;
            }
            self.task = self;
            self.init_templates(info);
            self.init(info.task);
            self.bind_items();
            if (self.ID === 0) {
                self.js_filename = 'jam/js/admin.js';
                self.settings.DYNAMIC_JS = false;
            }
            self.init_modules(callback);
            if (self.history_item) {
                self._set_history_item(self.item_by_ID(self.history_item))
            }
            window.onbeforeunload = function() {
                var i,
                    item;
                for (i = 0; i < self._edited_items.length; i++) {
                    item = self._edited_items[i];
                    if (item.is_changing() && item.is_modified()) {
                        if (item._tab_info) {
                            self.show_tab(item._tab_info.container, item._tab_info.tab_id);
                        }
                        return 'You have unsaved changes!';
                    }
                }
            }
        });
    }

    init_templates(info) {
        let self = this,
            class_list = {},
            div = $('<div class="templates">'),
            temp = $('<output>').append(div);
        div.append($.parseHTML(info.templates));
        this.templates = temp.find('.templates');
        temp.find('.templates > div').each(function() {
            for (let i=0; i < this.classList.length; i++) {
                class_list[this.classList[i]] = true;
            }
        })
        $(".templates > div").each(function() {
            let not_found = false;
            for (let i=0; i < this.classList.length; i++) {
                if (!class_list[this.classList[i]]) {
                    not_found = true;
                    break;
                }
            }
            if (not_found) {
                self.templates.append($(this));
            }
        })
    }

    init_modules(callback) {
        var self = this,
            mutex = 0,
            calcback_executing = false,
            calc_modules = function(item) {
                if (item.js_filename) {
                    mutex++;
                }
            },
            load_script = function(item) {
                if (item.js_filename) {
                    item.load_script(
                        item.js_filename,
                        function() {
                            if (--mutex === 0) {
                                self.bind_events();
                                if (!calcback_executing) {
                                    calcback_executing = true;
                                    self._page_loaded(callback);
                                }
                            }
                        }
                    );
                }
            };

        if (this.settings.DYNAMIC_JS) {
            mutex = 1;
            load_script(this);
        } else {
            this.all(calc_modules);
            this.all(load_script);
        }
    }

    _page_loaded(callback) {
        if (task.locale.RTL) {
            $('html').attr('dir', 'rtl')
        }
        if (this.on_page_loaded) {
            this.on_page_loaded.call(this, this);
        }
        if (callback) {
            callback.call(this)
        }
    }

    _set_history_item(item) {
        var self = this,
            doc_name;
        this.history_item = item;
        if (this.history_item) {
            this.history_item.read_only = true;
            item.view_options.fields = ['item_id', 'item_rec_id', 'date', 'operation', 'user'];
            if (!item.on_field_get_text) {
                item.on_field_get_text = function(field) {
                    var oper,
                        it;
                    if (field.field_name === 'operation') {
                        if (field.value === consts.RECORD_INSERTED) {
                            return self.language.created;
                        }
                        else if (field.value === consts.RECORD_MODIFIED ||
                            field.value === consts.RECORD_DETAILS_MODIFIED) {
                            return self.language.modified;
                        }
                        else if (field.value === consts.RECORD_DELETED) {
                            return self.language.deleted;
                        }
                    }
                    else if (field.field_name === 'item_id') {
                        it = self.item_by_ID(field.value);
                        if (it) {
                            doc_name = it.item_caption;
                            return doc_name;
                        }
                    }
                }
            }
            this.history_item.edit_record = function() {
                var it = item.task.item_by_ID(item.item_id.value),
                    hist = item.task.history_item.copy();
                hist.set_where({item_id: item.item_id.value, item_rec_id: item.item_rec_id.value});
                hist.set_order_by(['-date']);
                hist.open({limit: 100}, function() {
                //~ hist.open(function() {
                    it.display_history(hist);
                });
            }
        }
    }

    has_privilege(item, priv_name) {
        var priv_dic;
        if (item.task.ID === 0) {
            return true;
        }
        if (item.master) {
            if (!item.master.can_edit() && !item.master.can_create()) {
                return false;
            }
        }
        if (!this.user_privileges) {
            return true;
        } else {
            if (!this.user_privileges) {
                return false;
            }
            try {
                priv_dic = this.user_privileges[item.ID];
            } catch (e) {
                priv_dic = null;
            }
            if (priv_dic) {
                return priv_dic[priv_name];
            } else {
                return false;
            }
        }
    }

    create_cookie(name, value, days) {
        var expires;

        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toGMTString();
        } else {
            expires = "";
        }
        document.cookie = escape(name) + "=" + escape(value) + expires + "; path=/";
    }

    read_cookie(name) {
        var nameEQ = escape(name) + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return unescape(c.substring(nameEQ.length, c.length));
        }
        return null;
    }

    erase_cookie(name) {
        this.create_cookie(name, "", -1);
    }

    set default_content_visible(value) {
        let default_content = $('#container > #default-content');
        if (value) {
            default_content.show();
        }
        else {
            default_content.hide();
        }
    }

    set_forms_container(container, options) {
        if (container && container.length) {
            let default_content = $('#default-content');
            this.forms_container = container;
            if (!default_content.length) {
                default_content = $('<div id="default-content">')
                default_content.insertBefore(container);
            }
            if (options && options.splash_screen) {
                default_content.append(options.splash_screen)
            }
            if (this.forms_in_tabs) {
                this.init_tabs(container, {hide: true});
            }
        }
    }

    _create_menu_item(menu_item, parent, options) {
        if (menu_item.items.length) {
            if (menu_item.items.length === 1 && !options.create_group_for_single_item) {
                this._create_menu_item(menu_item.items[0], parent, options);
            }
            else {
                let li,
                    ul;
                if (parent.hasClass('dropdown-menu')) {
                    li = $('<li><a  class="dropdown-item" href="#">' +
                        menu_item.caption + ' &rtrif;</a></li>');
                    ul = $('<ul class="dropdown-menu dropdown-submenu">');
                }
                else {
                    li = $('<li class="nav-item dropdown"><a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">' +
                        menu_item.caption + '</a></li>');
                    ul = $('<ul class="dropdown-menu">');
                }
                parent.append(li);
                li.append(ul);
                for (let i = 0; i < menu_item.items.length; i++) {
                    this._create_menu_item(menu_item.items[i], ul, options)
                }
            }
        }
        else {
            if (menu_item.caption) {
                if (parent.hasClass('dropdown-menu')) {
                    parent.append($('<li>')
                        .append($('<a class="dropdown-item item-menu" href="#">' + menu_item.caption + '</a>')
                        .data('action', menu_item.action)));
                }
                else {
                    parent.append($('<li class="nav-item">')
                        .append($('<a class="nav-link item-menu" href="#">' + menu_item.caption + '</a>')
                        .data('action', menu_item.action)));
                }
            }
            else {
                parent.append($('<li class="dropdown-divider"></li>'));
            }
        }
    }

    _add_item_menu(item, sub_items) {
        let action;
        if (item instanceof Group) {
            if (item.visible) {
                item.each_item(function(i) {
                    if (i.visible && i.can_view()) {
                        sub_items.push(i);
                    }
                });
            }
            else {
                return;
            }
        }
        else {
            if (item.visible && item.can_view()) {
                if (item instanceof Item) {
                    action = function() {
                        item.view(this.forms_container);
                    }
                }
                else if (item instanceof Report) {
                    action = function() {
                        item.print(false);
                    }
                }
            }
        }
        return action;
    }

    _add_menu_item(custom_item, owner) {
        let menu_item = {
                items: [],
                caption: undefined
            },
            sub_items = [];
        if (custom_item instanceof AbsrtactItem) {
            let item = custom_item
            if (menu_item.caption === undefined) {
                menu_item.caption = item.item_caption;
            }
            menu_item.action = this._add_item_menu(item, sub_items)
        }
        else if (custom_item instanceof Array) {
            menu_item.caption = custom_item[0];
            if (custom_item.length > 1) {
                sub_items = custom_item[1]
            }
        }
        else if (custom_item instanceof Object) {
            for (let caption in custom_item) {
                menu_item.caption = caption;
                if (custom_item[caption] instanceof AbsrtactItem) {
                    menu_item.action = this._add_item_menu(custom_item[caption], sub_items);
                }
                else if (typeof custom_item[caption] === "function") {
                    menu_item.action = custom_item[caption];
                }
                else {
                    sub_items = custom_item[caption];
                }
            }
        }
        else if (custom_item === '') {
            menu_item.caption = '';
        }
        if (menu_item.action || sub_items.length || menu_item.caption === '') {
            owner.items.push(menu_item);
            for (let i = 0; i < sub_items.length; i++) {
                let res = this._add_menu_item(sub_items[i], menu_item);
            }
        }
    }

    _clear_dividers(menu_item) {
        if (menu_item.items.length) {
            if (menu_item.items[menu_item.items.length - 1].caption === '') {
                menu_item.items.pop();
            }
            if (menu_item.items[0].caption === '') {
                menu_item.items.shift();
            }
            for (let i = 0; i < menu_item.items.length; i++) {
                this._clear_dividers(menu_item.items[i]);
            }
        }
    }

    create_menu() {
        var self = this,
            $menu = arguments[0],
            forms_container = arguments[1],
            options = arguments[2],
            custom_menu,
            menu_items = {},
            default_options = {
                custom_menu: undefined,
                forms_container: undefined,
                splash_screen: undefined,
                view_first: false,
                create_single_group: false,
                create_group_for_single_item: false
            };
        if (arguments.length === 2) {
            options = arguments[1];
            forms_container = options.forms_container;
        }
        options = $.extend({}, default_options, options);

        this.set_forms_container(forms_container, {splash_screen: options.splash_screen});

        custom_menu = options.custom_menu;
        if (!custom_menu) {
            custom_menu = [];
            task.each_item(function(group) {
                if (group.visible) {
                    let item_count = 0;
                    group.each_item(function(item) {
                        if (item.visible) {
                            item_count += 1;
                        }
                    });
                    if (item_count > 0) {
                        custom_menu.push(group);
                    }
                }
            });
            if (custom_menu.length === 1 && !options.create_single_group) {
                let group = custom_menu[0]
                custom_menu = []
                group.each_item(function(item) {
                    if (item.visible) {
                        custom_menu.push(item);
                    }
                });
            }
        }
        menu_items.items = [];
        for (let i = 0; i < custom_menu.length; i++) {
            this._add_menu_item(custom_menu[i], menu_items);
        }
        for (let i = 0; i < menu_items.items.length; i++) {
            this._clear_dividers(menu_items.items[i]);
        }
        for (let i = 0; i < menu_items.items.length; i++) {
            this._create_menu_item(menu_items.items[i], $menu, options);
        }
        $menu.find('.item-menu').on('click', (function(e) {
            e.preventDefault();
            let navbar_content = $menu.parent();
            if (navbar_content.hasClass('show')) {
                navbar_content.removeClass('show');
            }
            let action = $(this).data('action');
            if (action) {
                action.call(self);
            }
        }));
        if (options.view_first) {
            let action = $menu.find('.item-menu:first').data('action');
            action.call(self);
        }
    }

    view_form_created(item) {
    }

    edit_form_created(item) {
    }

    _focusable_elements($element, inputs_only) {
        let el = $element.get(0),
            tags;
        if (el) {
            if (inputs_only) {
                tags = ['input', 'textarea', 'select'];
            }
            else {
                tags = ['a', 'button', 'input', 'textarea', 'select', 'details', '[tabindex]', '[contenteditable="true"]'];
            }
            const focusables = tags.map(selector => selector + ':not([tabindex^="-"]:not(hidden))').join(',');
            return [...el.querySelectorAll(focusables)
                ].filter(el => el.offsetParent !== null)
        }
        else {
            return [];
        }
    }

    _focus_element($element) {
        let focusable_elements;
        if (this.media === 0) {
            focusable_elements = this._focusable_elements($element, true);
        }
        if (focusable_elements && focusable_elements.length) {
            focusable_elements[0].focus();
        }
        else {
            $element.focus();
        }
    }

    _tab_pane(tab) {
        let item_name = tab.find('button').attr('id');
        return tab.parent().parent().find('> div.tab-content > div#' + item_name + '-pane')
    }

    _show_tab(tab) {
        let item_name = tab.find('button').attr('id'),
            tab_pane = this._tab_pane(tab),
            tab_div = tab.parent().parent();
        tab_div.find('> ul.nav-tabs > li > button').removeClass('active');
        tab_div.find('> div.tab-content > div.tab-pane').removeClass('active');
        tab.find('button').addClass('active');
        tab_pane.addClass('active').addClass('show').trigger('tab_active_changed');
        let el = tab_pane.data('active_el');
        if (el) {
            el.focus();
        }
        else {
            this._focus_element(tab_pane);
        }
        tab_pane.on('tab_active_changed', function() {
            var form = tab_pane.find('.jam-form:first');
            if (form.length) {
                form.trigger('active_changed');
            }
        });
    }

    _check_tabs_empty(container) {
        var tabs = container.find('> .tabs-div');
        if (tabs.find('> ul.nav-tabs > li').length) {
            tabs.show();
        }
        else {
            tabs.hide();
        }
    }

    show_tab(container, tab_id) {
        var tab = container.find('> .tabs-div > ul.nav-tabs > li > button#' + tab_id);
        if (tab.length) {
            this._show_tab(tab.parent());
        }
        this._check_tabs_empty(container);
    }

    _close_tab(tab) {
        var tabs = tab.parent(),
            tab_content = this._tab_pane(tab),
            new_tab;
        this._show_tab(tab);
        if (tab.prev().length) {
            new_tab = tab.prev()
        }
        else {
            new_tab = tab.next()
        }
        this._tab_pane(tab).remove()
        tab.remove();
        if (new_tab.length) {
            this._show_tab(new_tab);
        }
        if (!tabs.children().length) {
            tabs.parent().hide();
        }
    }

    close_tab(container, tab_id) {
        var tab = container.find('> .tabs-div > ul.nav-tabs > li button#' + tab_id);
        if (tab.length) {
            this._close_tab(tab.parent());
        }
        this._check_tabs_empty(container);
    }

    init_tabs(container, options) {
        let div,
            default_options = {
                tab_content: true,
                consistent_height: false,
                hide: false
            }
        options = $.extend({}, default_options, options);
        div = $('<div class="tabs-div">');
        if (options.consistent_height) {
            div.addClass('consistent-height')
        }
        container.empty();
        container.append(div);
        if (options.hide) {
            div.hide();
        }
        div.append('<ul class="nav nav-tabs" role="tablist">');
        if (options.tab_content) {
            div.append('<div class="tab-content">');
        }
        div.hide();
    }

    can_add_tab(container) {
        return container.find('> .tabs-div  > ul.nav-tabs').length > 0
    }

    add_tab(container, tab_name, options) {
        var self = this,
            div,
            tabs,
            active_tab,
            tab_content,
            tab_text,
            cur_tab,
            cur_tab_content;
        if (!container.length) {
            this.warning('Container must be specified.')
        }
        if (!tab_name) {
            this.warning('Tab name must be specified.')
        }
        if (!options) {
            options = {};
        }
        tabs = container.find('> .tabs-div > ul.nav-tabs');
        if (tabs.length) {
            active_tab = tabs.find('> li > button.active');
            if (active_tab) {
                active_tab = active_tab.parent();
            }
            if (options.tab_id === undefined) {
                options.tab_id = 'tab' + tabs.find('> li').length + 1;
            }
            cur_tab = tabs.find('> li button#' + options.tab_id);
            if (cur_tab.length) {
                cur_tab = cur_tab.parent();
            }
            else {
                tab_content = container.find('> .tabs-div > div.tab-content');
                if (options.show_close_btn) {
                    tab_name = '<span> ' + tab_name + '  </span><i class="bi bi-x-lg close-tab-btn ms-1"></i>';
                }
                cur_tab = $('<li class="nav-item" role="presentation">' +
                    '<button class="nav-link" id="' + options.tab_id +
                    '" data-bs-toggle="tab" data-bs-target="#' + options.tab_id + '-pane" type="button"' +
                    'role="tab" aria-controls="' + options.tab_id +'-pane" aria-selected="true">' +
                    tab_name + '</button>');
                cur_tab_content = $('<div class="tab-pane" id="' + options.tab_id + '-pane"' +
                    '" role="tabpanel" aria-labelledby="home-tab" tabindex="0"></div>');
                if (options.insert_after_cur_tab) {
                    cur_tab.insertAfter(active_tab)
                }
                else {
                    tabs.append(cur_tab);
                }
                tab_content.append(cur_tab_content);
                cur_tab.on('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._show_tab($(this));
                    if (options.on_click) {
                        options.on_click.call(self, options.tab_id);
                    }
                });
                cur_tab_content.on('focusout', function(e) {
                    var found;
                    $(e.target).parents().each(function() {
                        if (this === cur_tab_content.get(0)) {
                            cur_tab_content.data('active_el', e.target);
                            return false;
                        }
                    })
                });
                if (options.show_close_btn) {
                    cur_tab.on('click', '.close-tab-btn', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (options.on_close) {
                            options.on_close.call();
                        }
                        else {
                            self.close_tab(container, options.tab_id);
                        }
                    });
                }
            }
            if (options.set_active || !active_tab.length) {
                this.show_tab(container, options.tab_id);
            }
            return cur_tab_content
        }
    }

    px_size(size) {
        if (typeof size == 'string' && size.slice(-3) == 'rem') {
            return parseFloat(size) *
                parseFloat(getComputedStyle(document.documentElement).fontSize);
        }
        return size
    }
}


export default Task
