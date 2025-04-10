import consts from "./consts.js";
import AbsrtactItem from "./abstr_item.js";
import Field from "./field.js";
import Filter from "./filter.js";
import DBTable from "./table.js";
import DBTree from "./tree.js";
import {DBInput} from "./input.js";

class RecInfo {
    constructor(item) {
        this.item = item;
        this.expanded = item.expanded;
        this.record_status = consts.RECORD_UNCHANGED;
        this.log_index = null;
        this.details = {};
    }

    add_detail(detail_change_log) {
        this.details[detail_change_log.item.ID] = detail_change_log;
    }

    get_changes() {
        let result = {};
        for (let ID in this.details) {
            let detail = this.details[ID],
                detail_changes = {};
            detail.get_changes(detail_changes);
            result[ID] = detail_changes;
        }
        return result;
    }

    update(details) {
        this.log_index = null;
        for (let ID in details) {
            this.details[ID].update(details[ID]);
        }
    }

    copy() {
        let result = new RecInfo(this.item);
        result.record_status  = this.record_status;
        result.log_index = this.log_index;
        result.details = {};
        for (let ID in this.details) {
            result.details[ID] = this.details[ID].copy();
        }
        return result;
    }

    restore() {
        for (let ID in this.details) {
            this.details[ID].restore();
        }
    }
}

class ChangeLog {
    constructor(item, copy) {
        let self = this;
        this.item = item;
        this.expanded = item.expanded
        this.logs = [];
        this.dataset = item._dataset;
        this.fields = [];
        this.item.each_field(function(field) {
            self.fields.push(field.field_name);
        });
        if (this.item.master && !copy) {
            this.item.master.change_log.record_info.add_detail(this);
        }
    }

    detail_change_log(detail) {
        return this.record_info[detail.ID];
    }

    get cur_record() {
        return this.item._dataset[this.item.rec_no];
    }

    set cur_record(value) {
        this.item._dataset[this.item.rec_no] = value;
    }

    get record_info() {
        return this.get_record_info();
    }

    get_record_info(record) {
        if (!record) {
            record = this.cur_record;
        }
        if (record.length < this.item._record_info_index + 1) {
            record.push(new RecInfo(this.item));
        }
        return record[this.item._record_info_index];
    }

    get record_status() {
        return this.record_info.record_status;
    }

    set record_status(value) {
        if (this.record_info.log_index === null) {
            if (value !== consts.RECORD_UNCHANGED) {
                this.logs.push(this.cur_record);
                this.record_info.log_index = this.logs.length - 1;
            }
        }
        else {
            if (value === consts.RECORD_UNCHANGED) {
                this.logs[this.record_info.log_index] = null;
                this.cur_record[this.item._record_info_index] = new RecInfo(this.item);
            }
            else {
                this.logs[this.record_info.log_index] = this.cur_record;
            }
        }
        this.record_info.record_status = value;
    }

    get empty() {
        for (let i = 0; i < this.logs.length; i++) {
            if (this.logs[i]) {
                return false;
            }
        }
        return true;
    }

    detail_modified() {
        if (this.record_status === consts.RECORD_UNCHANGED) {
            this.record_status = consts.RECORD_DETAILS_MODIFIED;
        }
        if (this.item.master) {
            this.item.master.change_log.detail_modified();
        }
    }

    log_change() {
        let state = this.item.item_state;
        if (this.item.log_changes) {
            if (state === consts.STATE_INSERT) {
                this.record_status = consts.RECORD_INSERTED;
            } else if (state === consts.STATE_EDIT) {
                if (this.record_status === consts.RECORD_UNCHANGED) {
                    this.record_status = consts.RECORD_MODIFIED;
                } else if (this.record_status === consts.RECORD_DETAILS_MODIFIED) {
                    this.record_status = consts.RECORD_MODIFIED;
                }
            } else if (state === consts.STATE_DELETE) {
                if (this.record_status === consts.RECORD_INSERTED) {
                    this.record_status = consts.RECORD_UNCHANGED;
                } else {
                    this.record_status = consts.RECORD_DELETED;
                }
            } else {
                throw new Error(this.item.item_name + ': change log invalid records state');
            }
            if (this.item.master) {
                this.item.master.change_log.detail_modified();
            }
        }
    }

    copy_record(record) {
        return record.slice(0, this.item._record_info_index);
    }

    get_changes(result) {
        let logs = [],
            counter = 0;
        result.fields = this.fields;
        result.expanded = this.expanded;
        result.logs = logs;
        for (let i = 0; i < this.logs.length; i++) {
            let record = this.logs[i];
            if (record) {
                let record_info = this.get_record_info(record);
                if (record_info.record_status !== consts.RECORD_UNCHANGED) {
                    let new_record = this.copy_record(record);
                    logs.push({
                        record_status: record_info.record_status,
                        log_index: record_info.log_index,
                        record: new_record,
                        details: record_info.get_changes()
                    });
                    counter += 1;
                }
            }
        };
        return counter;
    }

    update(updates) {
        if (updates) {
            let self = this,
                logs = updates.logs;
            for (let i = 0; i < logs.length; i++) {
                let log_index = logs[i].log_index,
                    record = logs[i].record,
                    log_record = this.logs[log_index],
                    rec_info = this.get_record_info(log_record);
                if (logs[i].record_status !== consts.RECORD_DELETED) {
                    Array.prototype.splice.apply(log_record, [0, record.length].concat(record));
                }
                rec_info.record_status = consts.RECORD_UNCHANGED;
                rec_info.update(logs[i].details);
            }
            this.logs = [];
            this.item.update_controls();
        }
    }

    copy() {
        let self = this,
            result = new ChangeLog(this.item, true);
        result.logs = [];
        result.fields = this.fields.slice();
        result.dataset = [];
        result.rec_no = null;
        if (this.dataset) {
            result.rec_no = this.item.rec_no;
            this.dataset.forEach(function(record) {
                let rec_info_copy = self.get_record_info(record).copy(),
                    rec_copy = record.slice();
                rec_copy[self.item._record_info_index] = rec_info_copy;
                if (rec_info_copy.log_index !== null) {
                    result.logs.push(rec_copy);
                    rec_info_copy.log_index = result.logs.length - 1;
                }
                result.dataset.push(rec_copy);
            });
        }
        return result;
    }

    restore() {
        this.item._dataset = this.dataset;
        if (this.rec_no !== null) {
            this.item.rec_no = this.rec_no;
        }
        if (this.dataset.length) {
            this.record_info.restore();
        }
    }

    store_record() {
        let result = this.cur_record.slice();
        result[this.item._record_info_index] = this.record_info.copy();
        return result;
    }

    restore_record(data) {
        this.record_status = consts.RECORD_UNCHANGED
        this.cur_record = data;
        this.rec_no = null;
        this.restore();
        this.record_status = this.record_status;
    }
}

class Item extends AbsrtactItem {
    constructor(owner, ID, item_name, caption, visible, type, js_filename) {
        super(owner, ID, item_name, caption, visible, type, js_filename);
        if (this.task && this.item_type !== 'detail' && !(item_name in this.task)) {
            this.task[item_name] = this;
        }
        this.field_defs = [];
        this._fields = [];
        this.fields = [];
        this.filter_defs = [];
        this.filters = [];
        this.details = [];
        this.controls = [];
        this._paginate = undefined;
        this.disabled = false;
        this.expanded = true;
        this.permissions = {
            can_create: true,
            can_edit: true,
            can_delete: true
        };
        this._log_changes = true;
        this._dataset = null;
        this._eof = false;
        this._bof = false;
        this._cur_row = null;
        this._old_row = 0;
        this._buffer = null;
        this._modified = null;
        this._state = 0;
        this._read_only = false;
        this.owner_read_only = true;
        this._can_modify = true;
        this._active = false;
        this._virtual_table = false;
        this._disabled_count = 0;
        this._open_params = {};
        this._where_list = [];
        this._order_by_list = [];
        this._select_field_list = [];
        this._record_lookup_index = -1
        this._record_info_index = -1
        this._limit = 10;
        this._offset = 0;
        this._selections = undefined;
        this._show_selected = false;
        this.selection_limit = 1500;
        this.is_loaded = false;
        this.lookup_field = null;
        if (this.task) {
            this.view_options = $.extend({}, this.task.view_options);
            this.table_options = $.extend({}, this.task.table_options);
            this.edit_options = $.extend({}, this.task.edit_options);
            this.filter_options = $.extend({}, this.task.form_options);
        }
    }

    getChildClass() {
        return Detail;
    }

    initAttr(info) {
        var i,
            field_defs = info.fields,
            filter_defs = info.filters,
            len;
        if (field_defs) {
            len = field_defs.length;
            for (i = 0; i < len; i++) {
                this.field_defs.push(field_defs[i]);
                new Field(this, field_defs[i]);
            }
        }
        if (filter_defs) {
            len = filter_defs.length;
            for (i = 0; i < len; i++) {
                this.filter_defs.push(filter_defs[i]);
                new Filter(this, filter_defs[i]);
            }
        }
        this.reports = info.reports;
    }

    _bind_item() {
        var i = 0,
            len,
            reports;

        this._prepare_fields();
        this._prepare_filters();

        len = this.reports.length;
        reports = this.reports;
        this.reports = [];
        for (i = 0; i < len; i++) {
            this.reports.push(this.task.item_by_ID(reports[i]));
        }
        this.init_params();
    }

    _can_do(operation) {
        return this.task.has_privilege(this, operation) &&
            this.permissions[operation] && this.can_modify;
    }

    can_create() {
        return this._can_do('can_create')
    }

    can_edit() {
        return this._can_do('can_edit')
    }

    can_delete() {
        return this._can_do('can_delete')
    }

    _prepare_fields() {
        var i = 0,
            len = this._fields.length,
            field,
            lookup_field,
            lookup_field1;
        for (; i < len; i++) {
            field = this._fields[i];
            if (field.lookup_item && (typeof field.lookup_item === "number")) {
                field.lookup_item = this.task.item_by_ID(field.lookup_item);
                if (field.lookup_field && (typeof field.lookup_field === "number")) {
                    lookup_field = field.lookup_item._field_by_ID(field.lookup_field);
                    field.lookup_field = lookup_field.field_name;
                    if (lookup_field.lookup_item && field.lookup_field1) {
                        field.lookup_item1 = lookup_field.lookup_item
                        if (typeof field.lookup_item1 === "number") {
                            field.lookup_item1 = this.task.item_by_ID(field.lookup_item1);
                        }
                        if (typeof field.lookup_field1 === "number") {
                            lookup_field1 = field.lookup_item1._field_by_ID(field.lookup_field1)
                            field.lookup_field1 = lookup_field1.field_name
                        }
                        if (lookup_field1.lookup_item && field.lookup_field2) {
                            field.lookup_item2 = lookup_field1.lookup_item;
                            if (typeof field.lookup_item2 === "number") {
                                field.lookup_item2 = self.task.item_by_ID(field.lookup_item2);
                            }
                            if (typeof field.lookup_field2 === "number") {
                                field.lookup_field2 = field.lookup_item2._field_by_ID(field.lookup_field2).field_name;
                            }
                        }

                    }
                }
            }
            if (field.master_field && (typeof field.master_field === "number")) {
                field.master_field = this.get_master_field(this._fields, field.master_field);
            }
            if (field.lookup_values && (typeof field.lookup_values === "number")) {
                field.lookup_values = self.task.lookup_lists[field.lookup_values];
            }

        }
        this.fields = this._fields.slice(0);
        for (i = 0; i < len; i++) {
            field = this.fields[i];
            if (this[field.field_name] === undefined) {
                this[field.field_name] = field;
            }
        }
    }

    dyn_fields(fields) {
        var i,
            j,
            attr,
            val,
            field_type,
            data_type,
            field_def;
        this._fields = [];
        this.fields = [];
        this.field_defs = [];
        for (var i = 0; i < fields.length; i++) {
            field_def = []
            for (var j = 0; j < field_attr.length; j++) {
                attr = field_attr[j];
                if (attr.charAt(0) === '_') {
                    attr = attr.substr(1);
                }
                if (attr === 'data_type') {
                    attr = 'field_type'
                }
                val = fields[i][attr]
                switch (attr) {
                    case 'ID':
                        val = i + 1;
                        break;
                    case 'field_type':
                        field_type = fields[i]['field_type']
                        val = field_type_names.indexOf(field_type);
                        if (val < 1) {
                            val = 1;
                        }
                        data_type = val;
                        break;
                    case 'field_size':
                        if (data_type === 1 && !val) {
                            val = 99999;
                        }
                        break;
                    case 'lookup_item':
                        if (val) {
                            //~ lookup_item = val;
                            val = val.ID
                        }
                        break;
                    case 'field_interface':
                        val = {
                            do_not_sanitize: false,
                            field_mask: "",
                            textarea: false
                        }
                        break;
                }
                field_def.push(val);
            }
            this.field_defs.push(field_def);
        }
        for (i = 0; i < this.field_defs.length; i++) {
            new Field(this, this.field_defs[i]);
        }
        this._prepare_fields();
    }

    _prepare_filters() {
        var i = 0,
            len,
            field;
        len = this.filters.length;
        for (i = 0; i < len; i++) {
            field = this.filters[i].field;
            if (field.lookup_item && (typeof field.lookup_item === "number")) {
                field.lookup_item = this.task.item_by_ID(field.lookup_item);
            }
            if (field.lookup_field && (typeof field.lookup_field === "number")) {
                field.lookup_field = field.lookup_item._field_by_ID(field.lookup_field).field_name;
            }
        }
    }

    ids_to_field_names(ids) {
        var i,
            field,
            result = [];
        if (ids && ids.length) {
            for (i = 0; i < ids.length; i++) {
                field = this._field_by_ID(ids[i]);
                if (field) {
                    result.push(field.field_name);
                }
            }
        }
        return result;
    }

    ids_to_item_names(ids) {
        var i,
            item,
            result = [];
        if (ids && ids.length) {
            for (i = 0; i < ids.length; i++) {
                item = this.item_by_ID(ids[i]);
                if (item) {
                    result.push(item.item_name);
                }
            }
        }
        if (result.length) {
            return result;
        }
    }

    _process_view_params() {
        var i,
            index = 0,
            field_name,
            field,
            fields = [],
            order,
            table_options,
            table_fields,
            actions,
            form_template,
            form_options,
            column_width = {};
        if (this._view_params instanceof Array) { // for compatibility with previous versions
            for (i = 0; i < this._view_params.length; i++) {
                field = this._field_by_ID(this._view_params[i][0]);
                if (field) {
                    fields.push([field.ID, '']);
                }
            }
            this._view_params = {0: ['', {}, [], {}, fields]};
        }

        index = task.media;
        while (index > 0) {
            if (this._view_params[index] === undefined) {
                index -= 1;
            }
            else {
                break;
            }
        }

        form_template = this._view_params[index][0];
        form_options = this._view_params[index][1];
        actions = this._view_params[index][2];
        table_options = this._view_params[index][3];
        table_fields = this._view_params[index][4];

        fields = []
        for (i = 0; i < table_fields.length; i++) {
            field = this._field_by_ID(table_fields[i][0]);
            if (field) {
                field_name = field.field_name;
                fields.push(field_name);
                if (table_fields[i][1]) {
                    column_width[field_name] = table_fields[i][1];
                }
            }
        }
        this.view_options.fields = fields;

        form_options.default_order = [];
        if (this._default_order) {
            for (i = 0; i < this._default_order.length; i++) {
                field = this._field_by_ID(this._default_order[i][0]);
                if (field) {
                    order = field.field_name;
                    if (this._default_order[i][1]) {
                        order = '-' + order
                    }
                    form_options.default_order.push(order);
                }
                else {
                    form_options.default_order = [];
                    break;
                }
            }
        }
        this._default_order = undefined;

        form_options.view_detail = this.ids_to_item_names(form_options.view_detail);
        form_options.view_details = form_options.view_detail; // for compatibility with previous versions
        form_options.search_field = this.ids_to_field_names(form_options.search_field);
        form_options.search_field = form_options.search_field.length ? form_options.search_field[0] : undefined;
        table_options.column_width = column_width;
        table_options.summary_fields = this.ids_to_field_names(table_options.summary_fields);
        table_options.editable_fields = this.ids_to_field_names(table_options.edit_fields);
        delete table_options.edit_fields;
        table_options.sort_fields = this.ids_to_field_names(table_options.sort_fields);

        this.view_options.title = this.item_caption;
        this.view_options = $.extend(this.view_options, form_options);
        this._view_options = $.extend({}, this.view_options);
        this.table_options = $.extend(this.table_options, table_options);
        this._table_options = $.extend({}, this.table_options);
    }

    _process_edit_params() {
        var i,
            j,
            k,
            index = 0,
            field_name,
            field,
            fields = [],
            tab,
            tabs,
            band,
            bands,
            form_tabs,
            actions,
            form_template,
            form_options,
            input_width;
        if (this._edit_params instanceof Array) { // for compatibility with previous versions
            for (i = 0; i < this._edit_params.length; i++) {
                field = this._field_by_ID(this._edit_params[i][0]);
                if (field) {
                    fields.push([field.ID, '']);
                }
            }
            this._edit_params = { 0: ['', {}, [], [['', [[{}, fields, '']]]]] };
        }

        index = task.media;
        while (index > 0) {
            if (this._edit_params[index] === undefined) {
                index -= 1;
            }
            else {
                break;
            }
        }

        this.edit_options.fields = [];
        form_template = this._edit_params[index][0];
        form_options = this._edit_params[index][1];
        actions = this._edit_params[index][2];
        form_tabs = this._edit_params[index][3];

        tabs = [];
        fields = [];
        for (i = 0; i < form_tabs.length; i++) {
            tab = {}
            tab.name = form_tabs[i][0];
            tab.bands = [];
            bands = form_tabs[i][1];
            for (j = 0; j < bands.length; j++) {
                band = {}
                band.fields = [];
                input_width = {}
                band.options = bands[j][0]
                band.options.input_width = input_width;
                fields = bands[j][1]
                band.name = bands[j][2]
                for (k = 0; k < fields.length; k++) {
                    field = this._field_by_ID(fields[k][0]);
                    if (field) {
                        field_name = field.field_name;
                        band.fields.push(field_name);
                        if (fields[k][1]) {
                            input_width[field_name] = fields[k][1];
                        }
                    }
                }
                tab.bands.push(band);
            }
            tabs.push(tab)
        }
        form_options.edit_details = this.ids_to_item_names(form_options.edit_details);
        this.edit_options.title = this.item_caption;
        this.edit_options = $.extend(this.edit_options, form_options);
        this.edit_options.tabs = tabs;
        this._edit_options = $.extend(true, {}, this.edit_options);
    }

    init_params() {
        this._process_view_params();
        this._process_edit_params();
    }

    each(callback) {
        var value;

        if (this._active) {
            this.first();
            while (!this.eof()) {
                value = callback.call(this, this);
                if (value === false) {
                    break;
                } else {
                    this.next();
                }
            }
        }
    }

    each_field(callback) {
        var i = 0,
            len = this.fields.length,
            value;
        for (; i < len; i++) {
            value = callback.call(this.fields[i], this.fields[i], i);
            if (value === false) {
                break;
            }
        }
    }

    each_filter(callback) {
        var i = 0,
            len = this.filters.length,
            value;
        for (; i < len; i++) {
            value = callback.call(this.filters[i], this.filters[i], i);
            if (value === false) {
                break;
            }
        }
    }

    each_detail(callback) {
        var i = 0,
            len = this.details.length,
            value;
        for (; i < len; i++) {
            value = callback.call(this.details[i], this.details[i], i);
            if (value === false) {
                break;
            }
        }
    }

    _field_by_name(name) {
        return this.field_by_name(name, this._fields);
    }

    field_by_name(name, fields) {
        var i = 0,
            len,
            result;
        if (fields === undefined) {
            fields = this.fields;
        }
        result = fields[name]
        if (!(result instanceof Field)) {
            len = fields.length;
            for (; i < len; i++) {
                if (fields[i].field_name === name) {
                    return fields[i];
                }
            }
        }
        return result;
    }

    _field_by_ID(ID) {
        return this.field_by_ID(ID, this._fields);
    }

    field_by_ID(ID, fields) {
        var i = 0,
            len;
        if (fields === undefined) {
            fields = this.fields;
        }
        len = fields.length;
        for (; i < len; i++) {
            if (fields[i].ID === ID) {
                return fields[i];
            }
        }
    }

    filter_by_name(name) {
        var i = 0,
            len = this.filters.length;
        try {
            return this.filters[name];
        } catch (e) {
            for (; i < len; i++) {
                if (this.filters[i].filter_name === name) {
                    return this.filters[i];
                }
            }
        }
    }

    detail_by_name(name) {
        var i = 0,
            len = this.details.length;
        try {
            return this.details[name];
        } catch (e) {
            for (; i < len; i++) {
                if (this.details[i].item_name === name) {
                    return this.details[i];
                }
            }
        }
    }

    get dataset() {
        var i,
            len,
            result = [];
        if (this.active) {
            len = this._dataset.length;
            for (i = 0; i < len; i++)
                result.push(this._dataset[i].slice(0, this._record_info_index))
            return result
        }
    }

    set dataset(value) {
        this._dataset = value;
    }

    get selections() {
        return this._selections;
    }

    process_selection_changed(value) {
        var added = value[0],
            deleted = value[1];
        if (added && !added.length) {
            added = undefined;
        }
        if (deleted && !deleted.length) {
            deleted = undefined;
        }
        if (this.on_selection_changed && (added || deleted)) {
            this.on_selection_changed.call(this, this, added, deleted)
        }
    }

    set selections(value) {
        var self = this;

        if (!value || !(value instanceof Array)) {
            value = undefined;
        }
        if (this._selections) {
            this.process_selection_changed([undefined, this._selections.slice(0)]);
        }
        this._selections = value;

        if (this._selections instanceof Array) {
            this._selections.add = function() {
                var index = self._selections.indexOf(arguments[0]);
                if (index === -1) {
                    Array.prototype.push.apply(this, arguments);
                    self.process_selection_changed([[arguments[0]], undefined]);
                }
            }
            this._selections.push = function() {
                Array.prototype.push.apply(this, arguments);
                self.process_selection_changed([[arguments[0]], undefined]);
            };
            this._selections.remove = function() {
                var index = self._selections.indexOf(arguments[0]),
                    val,
                    removed = [];
                if (index !== -1) {
                    val = [self._selections[index]];
                    Array.prototype.splice.call(this, index, 1);
                    self.process_selection_changed([undefined, val]);
                }
            };
            this._selections.splice = function() {
                var deleted = self._selections.slice(arguments[0], arguments[0] + arguments[1]);
                Array.prototype.splice.apply(this, arguments);
                self.process_selection_changed([undefined, deleted]);
            };
            this._selections.pop = function() {
                throw new Error('Item selections do not support pop method');
            };
            this._selections.shift = function() {
                throw new Error('Item selections do not support shift method');
            }
            this._selections.unshift = function() {
                throw new Error('Item selections do not support unshift method');
            }

            this.process_selection_changed([this._selections.slice(0), undefined]);
        }
        this.update_controls();
    }

    copy(options) {
        if (this.master) {
            throw new Error('A detail can not be copied.');
        }
        return this._copy(options);
    }

    _copy(options) {
        var detail_copy,
            i,
            len,
            copy,
            field,
            result,
            defaultOptions = {
                filters: true,
                details: true,
                handlers: true,
                paginate: false
            };
        result = new Item(this.owner, this.ID, this.item_name,
            this.item_caption, this.visible, this.item_type_id);
        result.master = this.master;
        result.item_type = this.item_type;
        options = $.extend({}, defaultOptions, options);
        result.ID = this.ID;
        result.item_name = this.item_name;
        result.expanded = this.expanded;
        result.field_defs = this.field_defs;
        result.filter_defs = this.filter_defs;
        result.prototype_ID = this.prototype_ID;
        result.master_field = this.master_field
        result.master_applies = this.master_applies
        result._primary_key = this._primary_key
        result._deleted_flag = this._deleted_flag
        result._master_id = this._master_id
        result._master_rec_id = this._master_rec_id
        result._edit_options = this._edit_options;
        result._view_options = this._view_options;
        result._table_options = this._table_options;
        result._virtual_table = this._virtual_table;
        result.keep_history = this.keep_history;
        result.edit_lock = this.edit_lock;
        result._view_params = this._view_params;
        result._edit_params = this._edit_params;
        result.js_filename = this.js_filename;


        len = result.field_defs.length;
        for (i = 0; i < len; i++) {
            new Field(result, result.field_defs[i]);
        }
        result._prepare_fields();
        if (options.filters) {
            len = result.filter_defs.length;
            for (i = 0; i < len; i++) {
                new Filter(result, result.filter_defs[i]);
            }
            result._prepare_filters();
        }
        result._events = this._events;
        if (options.handlers) {
            len = this._events.length;
            for (i = 0; i < len; i++) {
                result[this._events[i][0]] = this._events[i][1];
            }
            result.edit_options = $.extend(true, {}, this._edit_options);
            result.view_options = $.extend(true, {}, this._view_options);
            result.table_options = $.extend(true, {}, this._table_options);
        }
        else {
            result.edit_options = $.extend(true, {}, this.task.edit_options);
            result.view_options = $.extend(true, {}, this.task.view_options);
            result.table_options = $.extend(true, {}, this.task.table_options);
        }
        if (options.paginate) {
            result._paginate = this._paginate;
        }
        if (options.details) {
            this.each_detail(function(detail, i) {
                detail_copy = detail._copy(options);
                detail_copy.owner = result;
                detail_copy.expanded = detail.expanded;
                if (detail.master) {
                    detail_copy.master = result;
                }
                detail_copy.item_type = detail.item_type;
                if (options.paginate) {
                    detail_copy._paginate = detail._paginate;
                }
                result.details.push(detail_copy);
                result.items.push(detail_copy);
                if (!(detail_copy.item_name in result)) {
                    result[detail_copy.item_name] = detail_copy;
                }
                if (!(detail_copy.item_name in result.details)) {
                    result.details[detail_copy.item_name] = detail_copy;
                }
            });
        }
        return result;
    }

    clone(keep_filtered) {
        var result,
            i,
            len,
            field,
            new_field;
        if (keep_filtered === undefined) {
            keep_filtered = true;
        }
        result = new Item(this.owner, this.ID, this.item_name,
            this.item_caption, this.visible, this.item_type_id);
        result.master = this.master;
        result.item_type = this.item_type;
        result.ID = this.ID;
        result.item_name = this.item_name;
        result.expanded = this.expanded;

        result.field_defs = this.field_defs;
        result.filter_defs = this.filter_defs;
        result.master_field = this.master_field
        result._primary_key = this._primary_key
        result._deleted_flag = this._deleted_flag
        result._master_id = this._master_id
        result._master_rec_id = this._master_rec_id

        len = result.field_defs.length;
        for (i = 0; i < len; i++) {
            field = new Field(result, result.field_defs[i]);
        }
        result._prepare_fields();

        len = result.fields.length;
        for (i = 0; i < len; i++) {
            field = result.fields[i]
            if (result[field.field_name] !== undefined) {
                delete result[field.field_name];
            }
        }
        result.fields = []
        len = this.fields.length;
        for (i = 0; i < len; i++) {
            field = this.fields[i];
            new_field = result._field_by_name(field.field_name)
            result.fields.push(new_field)
            if (result[new_field.field_name] === undefined) {
                result[new_field.field_name] = new_field;
            }
        }

        result._update_system_fields();

        result._bind_fields(result.expanded);
        result._dataset = this._dataset;
        if (keep_filtered) {
            result.on_filter_record = this.on_filter_record;
            result.filtered = this.filtered;
        }
        result._active = true;
        result.item_state = consts.STATE_BROWSE;
        result.first();
        return result;
    }

    _copy_record_fields(source, dest) {
        dest.each_field(function(field) {
            if (source[field.field_name]) {
                field.data = source[field.field_name].data;
                field.lookup_data = source[field.field_name].lookup_data;
            }
        });
    }

    update_record(data, detail) {
        let self = this;
        if (data && data.ID === this.ID) {
            let source = this.copy({handlers: false, details: false}),
                dest = this.clone(false);
            dest.log_changes = false;
            source.open({expanded: data.expanded, fields: data.fields, open_empty:true});
            source._dataset = data.dataset;
            source.first();
            dest.rec_no = this.rec_no;
            if (detail) {
                let pks = {};
                source.each(function(c) {
                    pks[c._primary_key_field.value] = [c.rec_no, null]
                });
                dest.each(function(d) {
                    if (pks[d._primary_key_field.value] !== undefined) {
                        pks[d._primary_key_field.value][1] = [d.rec_no];
                    }
                    else {
                        pks[d._primary_key_field.value] = [null, d.rec_no];
                    }
                });
                dest.first()
                while (!dest.eof()) {
                    let rec_info = pks[dest._primary_key_field.value]
                    if (rec_info[0] === null) {
                        dest.delete();
                    }
                    else {
                        source.rec_no = rec_info[0];
                        self._copy_record_fields(source, dest)
                        dest.next();
                    }
                }
                for (let rec_info in pks) {
                    if (pks.hasOwnProperty(rec_info)) {
                        if (rec_info[1] === null) {
                            dest.append();
                            self._copy_record_fields(source, dest)
                            dest.post();
                        }
                    }
                }
            }
            else {
                if (source.rec_count === 1 &&
                    dest._primary_key_field.value === source._primary_key_field.value) {
                    this._copy_record_fields(source, dest)
                }
                else {
                    throw new Error('Can not update the record.');
                }
            }
            this.update_controls();
            if (data.details) {
                data.details.forEach(function(detail_data) {
                    let detail = self.item_by_ID(detail_data.ID)
                    if (detail.active) {
                        detail.update_record(detail_data, true)
                    }
                })
            }
        }
    }

    store_handlers() {
        var result = {};
        for (var name in this) {
            if (this.hasOwnProperty(name)) {
                if ((name.substring(0, 3) === "on_") && (typeof this[name] === "function")) {
                    result[name] = this[name];
                }
            }
        }
        return result;
    }

    clear_handlers() {
        for (var name in this) {
            if (this.hasOwnProperty(name)) {
                if ((name.substring(0, 3) === "on_") && (typeof this[name] === "function")) {
                    this[name] = undefined;
                }
            }
        }
    }

    load_handlers(handlers) {
        for (var name in handlers) {
            if (handlers.hasOwnProperty(name)) {
                this[name] = handlers[name];
            }
        }
    }

    get log_changes() {
        if (this.master) {
            return this.master.log_changes;
        } else {
            return this._log_changes
        }
    }

    set log_changes(value) {
        this._log_changes = value;
    }

    is_modified() {
        return this._modified || !this._applied;
    }

    get _applied() {
        if (this.change_log && this.change_log.get_changes({})) {
            return false;
        }
        return true;
    }

    _store_modified(result) {
        if (result === undefined) {
            result = {};
        }
        result[this.ID] = this._modified;
        if (this.master) {
            this.master._store_modified(result)
        }
        return result
    }

    _restore_modified(value) {
        this._modified = value[this.ID];
        if (this.master) {
            this.master._restore_modified(value);
        }
    }

    _set_modified(value) {
        this._modified = value;
        if (this.master && value) {
            this.master._set_modified(value);
        }
    }

    _bind_fields(expanded) {
        var j = 0;
        if (expanded === undefined) {
            expanded = true;
        }
        this.each_field(function(field, i) {
            field.bind_index = null;
            field.lookup_index = null;
        });
        this.each_field(function(field, i) {
            if (!field.master_field && !field.calculated) {
                field.bind_index = j;
                j += 1;
            }
        });
        this.each_field(function(field, i) {
            if (field.master_field) {
                field.bind_index = field.master_field.bind_index;
            }
        });
        this._record_lookup_index = j
        if (expanded) {
            this.each_field(function(field, i) {
                if (field.calculated) {
                    field.bind_index = j;
                    j += 1;
                }
            });
            this.each_field(function(field, i) {
                if (field.lookup_item) {
                    field.lookup_index = j;
                    j += 1;
                }
            });
        }
        this._record_info_index = j;
    }

    set_fields(field_list) {
        this._select_field_list = field_list;
    }

    set_order_by(fields) {
        this._order_by_list = [];
        if (fields) {
            this._order_by_list = this.get_order_by_list(fields);
        }
    }

    get_order_by_list(fields) {
        var field,
            field_name,
            desc,
            fld,
            i,
            len,
            result = [];
        len = fields.length;
        for (i = 0; i < len; i++) {
            field = fields[i];
            field_name = field;
            desc = false;
            if (field[0] === '-') {
                desc = true;
                field_name = field.substring(1);
            }
            try {
                fld = this.field_by_name(field_name);
            } catch (e) {
                console.error(e);
                throw new Error(this.item_name + ': set_order_by method argument error - ' + field + ' ' + e);
            }
            result.push([fld.field_name, desc]);
        }
        return result;
    }

    set_where(whereDef) {
        this._where_list = this.get_where_list(whereDef);
    }

    get_where_list(whereDef) {
        var field,
            field_name,
            filter_type,
            filter_str,
            result = [];
        for (field_name in whereDef) {
            if (whereDef.hasOwnProperty(field_name)) {
                let field_arg = field_name,
                    value = whereDef[field_name],
                    arr = field_name.split('__');
                field_name = arr[0]
                if (arr.length >= 2) {
                    filter_str = arr[1]
                } else {
                    filter_str = 'eq';
                }
                filter_type = consts.filter_value.indexOf(filter_str);
                if (filter_type !== -1) {
                    filter_type += 1
                } else {
                    throw new Error(this.item_name + ': set_where method argument error - ' + field_arg);
                }
                field = this._field_by_name(field_name);
                if (!field) {
                    if (value instanceof Array &&  value[0] instanceof Array) {
                        let self = this,
                            array = [];
                        value.forEach(function(v) {
                            let d = {};
                            d[v[0]] = v[1];
                            array.push(self.get_where_list(d));
                        });
                        result.push(array);
                        continue;
                    }
                    else {
                        console.trace();
                        throw new Error(this.item_name + ': set_where method argument error - ' + field_arg);
                    }
                }
                if (value !== null) {
                    if (value instanceof Date) {
                        if (field.data_type === consts.DATE) {
                            value = task.format_date_to_string(value, '%Y-%m-%d')
                        }
                        else if (field.data_type === consts.DATETIME) {
                            value = task.format_date_to_string(value, '%Y-%m-%d %H:%M:%S')
                        }
                    }
                    result.push([field_name, filter_type, value, -1])
                }
            }
        }
        return result;
    }

    _update_system_fields() {
        let self = this,
            sys_fields = ['_primary_key', '_deleted_flag', '_master_id', '_master_rec_id', '_master_field'];
        this._master_field = this.master_field;
        sys_fields.forEach(function(sys_field_name) {
            let sys_field = self[sys_field_name];
            if (sys_field) {
                self[sys_field_name + '_field'] = self.field_by_name(sys_field);
            }
        });
    }

    _update_fields(fields) {
        var i,
            len,
            field;
        len = this.fields.length;
        for (i = 0; i < len; i++) {
            field = this.fields[i]
            if (this[field.field_name] !== undefined) {
                delete this[field.field_name];
            }
        }
        this.fields = [];
        if (fields === undefined && this._select_field_list.length) {
            fields = this._select_field_list;
        }
        if (fields) {
            len = fields.length;
            for (i = 0; i < len; i++) {
                this.fields.push(this._field_by_name(fields[i]));
            }
        } else {
            this.fields = this._fields.slice(0);
        }
        fields = []
        len = this.fields.length;
        for (i = 0; i < len; i++) {
            field = this.fields[i]
            if (this[field.field_name] === undefined) {
                this[field.field_name] = field;
            }
            fields.push(field.field_name);
        }
        this._update_system_fields();
        return fields
    }

    _do_before_open(options) {
        var i,
            j,
            filters = [];

        if (this.on_before_open) {
            this.on_before_open.call(this, this, options.params);
        }

        options.params.__expanded = options.expanded;
        options.params.__fields = [];

        options.fields = this._update_fields(options.fields);
        this._select_field_list = [];

        if (options.fields) {
            options.params.__fields = options.fields;
        }

        options.params.__open_empty = options.open_empty;
        if (!options.params.__order) {
            options.params.__order = []
        }
        if (!options.params.__filters) {
            options.params.__filters = []
        }
        if (!options.open_empty) {
            options.params.__limit = 0;
            options.params.__offset = 0;
            if (options.limit) {
                options.params.__limit = options.limit;
                if (options.offset) {
                    options.params.__offset = options.offset;
                }
            }
            if (options.where) {
                filters = this.get_where_list(options.where);
            } else if (this._where_list.length) {
                filters = this._where_list.slice(0);
            } else {
                this.each_filter(function(filter, i) {
                    if (filter.value !== null) {
                        filters.push([filter.field.field_name, filter.filter_type, filter.value, filter.ID]);
                    }
                });
            }
            if (options.params.__search !== undefined) {
                var s = options.params.__search;
                filters.push([s[0], s[2], s[1], -2]);
            }
            if (this._show_selected) {
                filters.push([this._primary_key, consts.FILTER_IN, this.selections, -3]);
            }
            options.params.__filters = filters;
            if (options.order_by) {
                options.params.__order = this.get_order_by_list(options.order_by);
            } else if (this._order_by_list.length) {
                options.params.__order = this._order_by_list.slice(0);
            }
            this._where_list = [];
            this._order_by_list = [];
            if (options.funcs) {
                options.params.__funcs = options.funcs;
            }
            if (options.group_by) {
                options.params.__group_by = options.group_by;
            }
        }
        this._open_params = options.params;
    }

    _do_after_open(err) {
        if (this.on_after_open) {
            this.on_after_open.call(this, this, err);
        }
        this.each_detail(function(d) {
            d.update_controls();
        })
    }

    open_details() {
        var i,
            self = this,
            args = this._check_args(arguments),
            callback = args['function'],
            options = args['object'],
            async = args['boolean'],
            details = this.details,
            d,
            detail_count = 0,
            store_rec_no = function(d) {
                if (options.master_refresh_record && d.active) {
                    d._prev_rec_no = d.rec_no
                }
                if (options.filters && options.filters[d.item_name]) {
                    d._where_list = options.filters[d.item_name];
                }
            },
            restore_rec_no = function(d) {
                if (d._prev_rec_no) {
                    d.rec_no = d._prev_rec_no
                    d._prev_rec_no = undefined;
                }
            },
            after_open = function(d) {
                detail_count -= 1;
                if (detail_count === 0 && callback) {
                    callback.call(self);
                }
                restore_rec_no(d);
            };
        if (!options) {
            options = {};
        }

        if (options.details) {
            for (i = 0; i < options.details; i++) {
                details.push(this.find(options.details[i]));
            }
        }

        if (callback || async) {
            for (i = 0; i < details.length; i++) {
                detail_count += 1;
            }
            for (i = 0; i < details.length; i++) {
                d = details[i];
                if (!d.disabled) {
                    if (options.default_order) {
                        d.set_order_by(d.view_options.default_order);
                    }
                    store_rec_no(d);
                    d.open(after_open);
                }
                else {
                    after_open(d)
                }
            }
        } else {
            for (i = 0; i < details.length; i++) {
                d = details[i];
                if (!d.disabled) {
                    if (options.default_order) {
                        d.set_order_by(d.view_options.default_order);
                    }
                    store_rec_no(d);
                    try {
                        d.open();
                    }
                    finally {
                        restore_rec_no(d);
                    }
                }
            }
        }
    }

    _update_params(params, new_params) {
        var i,
            s,
            old_filters = params.__filters,
            filters = [],
            filter,
            search_filter,
            sel_filter;
        for (i = 0; i < params.__filters.length; i++) {
            filter = params.__filters[i];
            if (filter instanceof Array &&  filter[0] instanceof Array) {
                filters.push(filter);
            }
            else {
                switch (filter[3]) {
                    case -1:
                        filters.push(filter)
                        break;
                    case -2:
                        search_filter = filter;
                        break;
                    case -3:
                        sel_filter = filter;
                        break;
                }
            }
        }
        this.each_filter(function(filter, i) {
            if (filter.value !== null) {
                filters.push([filter.field.field_name, filter.filter_type, filter.value, filter.ID]);
            }
        });
        if (new_params.hasOwnProperty('__search')) {
            s = new_params.__search;
            params.__search = new_params.__search;
            if (s !== undefined) {
                filters.push([s[0], s[2], s[1], -2]);
            }
        }
        else if (search_filter) {
            filters.push(search_filter)
        }
        if (new_params.hasOwnProperty('__show_selected_changed')) {
            if (this._show_selected) {
                filters.push([this._primary_key, consts.FILTER_IN, this.selections, -3]);
            }
        }
        else if (sel_filter) {
            filters.push(sel_filter);
        }

        params.__filters = filters;
        return params;
    }

    _check_open_options(options) {
        if (options) {
            if (options.fields && !$.isArray(options.fields)) {
                throw new Error(this.item_name + ': open method options error: the fields option must be an array.');
            }
            if (options.order_by && !$.isArray(options.order_by)) {
                throw new Error(this.item_name + ': open method options error: the order_by option must be an array.');
            }
            if (options.group_by && !$.isArray(options.group_by)) {
                throw new Error(this.item_name + ': open method options error: the group_by option must be an array.');
            }
        }
    }

    open() {
        let args = this._check_args(arguments),
            callback = args['function'],
            options = args['object'],
            async = args['boolean'];
        options = this._process_open_options(options);
        if (options !== undefined) {
            if (!async) {
                async = callback ? true : false;
            }
            this._do_open(options.offset, async, options.params, options.open_empty, callback);
        }
        else if (callback) {
            callback.call(this, this);
        }
    }

    _process_open_options(options) {
        if (!options) {
            options = {};
        }
        this._check_open_options(options);
        if (!options.params) {
            options.params = {};
        }
        if (options.expanded === undefined) {
            options.expanded = this.expanded;
        } else {
            this.expanded = options.expanded;
        }
        if (this.master) {
            if (this.master.rec_count > 0) {
                let dataset;
                options.params.__master_id = null
                if (this.master_field) {
                    if (this.owner.rec_count && !this.owner.is_new()) {
                        options.params.__master_field = this.owner._primary_key_field.value;
                    }
                    else {
                        options.open_empty = true;
                    }
                }
                else if (this._master_id) {
                    options.params.__master_id = this.master.ID;
                    options.params.__master_rec_id = this.master.field_by_name(this.master._primary_key).value;
                }
                else if (this._master_rec_id) {
                    options.params.__master_rec_id = this.master.field_by_name(this.master._primary_key).value;
                }
                if (this.master.is_new()) {
                    dataset = [];
                    this.change_log = new ChangeLog(this);
                } else {
                    let change_log = this.master.change_log.detail_change_log(this);
                    if (change_log && !change_log.empty) {
                        this.change_log = change_log;
                        dataset = this.change_log.dataset;
                        fields = this.change_log.fields;
                    }
                }
                if (dataset !== undefined) {
                    this._do_before_open(options)
                    this._bind_fields(options.expanded);
                    this._dataset = dataset;
                    if (this.change_log) {
                        this.change_log.dataset = dataset;
                    }
                    this._active = true;
                    this.item_state = consts.STATE_BROWSE;
                    this.first();
                    this._do_after_open();
                    this.update_controls(consts.UPDATE_OPEN);
                    return;
                }
            } else {
                this.close();
                this.update_controls(consts.UPDATE_OPEN);
                return;
            }
        }

        if (this._paginate && options.offset !== undefined) {
            options.params = this._update_params(this._open_params, options.params);
            options.params.__offset = options.offset;
            if (this.on_before_open) {
                this.on_before_open.call(this, this, options.params);
            }
            this._open_params = options.params;
        } else {
            if (options.offset === undefined) {
                options.offset = 0;
            }
            this._do_before_open(options);
            this._bind_fields(options.expanded);
        }
        if (this._paginate) {
            options.params.__limit = this._limit;
        }
        return options;
    }

    _do_open(offset, async, params, open_empty, callback) {
        var self = this,
            i,
            filters,
            data;
        params = $.extend(true, {}, params);
        for (i = 0; i < params.__filters.length; i++) {
            let filter = params.__filters[i];
            if (filter[0] instanceof Array) {
                filter.forEach(function(or_filter) {
                    or_filter[0].length = 3;
                });
            }
            else {
                filter.length = 3;
            }
        }
        if (open_empty) {
            data = [[], ''];
            this._do_after_load(data, offset, params, callback);
        }
        else if (async) {
            this.send_request('open', params, function(data) {
                self._do_after_load(data, offset, params, callback);
            });
        } else {
            data = this.send_request('open', params);
            this._do_after_load(data, offset, params, callback);
        }
    }

    _do_after_load(data, offset, params, callback) {
        var rows,
            error_mes,
            i,
            len;
        this._dataset = [];
        if (data) {
            error_mes = data[1];
            if (error_mes) {
                this.alert_error(error_mes)
            } else {
                if (data[0]) {
                    rows = data[0];
                    len = rows.length;
                    this._dataset = rows;
                    this.change_log = new ChangeLog(this);
                    if (this._limit && this._paginate && rows) {
                        this._offset = offset;
                        this.is_loaded = false;
                    }
                    if (len < this._limit) {
                        this.is_loaded = true;
                    }
                    this._active = true;
                    this.item_state = consts.STATE_BROWSE;
                    this._cur_row = null;
                    this.first();
                    this._do_after_open(error_mes);
                    if (!this._paginate || this._paginate && offset === 0) {
                        if (this.on_filters_applied) {
                            this.on_filters_applied.call(this, this);
                        }
                        if (this._on_filters_applied_internal) {
                            this._on_filters_applied_internal.call(this, this);
                        }
                    }
                    this.update_controls(consts.UPDATE_OPEN);
                    if (callback) {
                        callback.call(this, this);
                    }
                }
            }
        } else {
            this._dataset = [];
            console.log(this.item_name + " error while opening table");
        }
    }

    _do_on_refresh(rec_no, callback) {
        if (rec_no !== null) {
            this.rec_no = rec_no;
        }
        if (callback) {
            callback.call(this);
        }
        this.update_controls(consts.UPDATE_REFRESH)
    }

    refresh(call_back) {
        var args = this._check_args(arguments),
            callback = args['function'],
            async = args['boolean'],
            self = this,
            rec_no = this.rec_no;
        if (callback || async) {
            this._reopen(this._open_params.__offset, {}, function() {
                self._do_on_refresh(rec_no, callback);
            });
        }
        else {
            this._reopen(this._open_params.__offset, {});
            this._do_on_refresh(rec_no, callback);
        }
    }

    refresh_page(call_back) { // depricated
        this.refresh(call_back);
    }

    _reopen(offset, params, callback) {
        var options = {};
        if (this.paginate) {
            this.open({offset: offset, params: params}, callback);
        }
        else {
            options.params = params;
            params = this._update_params(this._open_params, params);
            this._where_list = this._open_params.__filters;
            this._order_by_list = this._open_params.__order;
            options.expanded = this._open_params.__expanded;
            options.open_empty = this._open_params.__open_empty;
            options.offset = this._open_params.__offset;
            options.limit = this._open_params.__limit;
            this.open(options, callback);
        }
    }

    _do_close() {
        this._dataset = null;
        this._cur_row = null;
        this._active = false;
        this.each_detail(function(d) {
            d._do_close();
        });
    }

    close() {
        this._do_close();
        this.update_controls(consts.UPDATE_CLOSE);
    }

    sort(field_list) {
        var list = this.get_order_by_list(field_list)
        this._sort(list);
    }

    _sort(sort_fields) {
        var i,
            field_names = [],
            desc = [];
        for (i = 0; i < sort_fields.length; i++) {
            field_names.push(this.field_by_name(sort_fields[i][0]).field_name);
            desc.push(sort_fields[i][1]);
        }
        this._sort_dataset(field_names, desc);
    }

    _sort_dataset(field_names, desc) {
        var self = this,
            i,
            field_name,
            field;

        function convert_value(value, data_type) {
            if (value === null) {
                if (data_type === consts.TEXT) {
                    value = ''
                } else if (data_type === consts.INTEGER || data_type === consts.FLOAT || data_type === consts.CURRENCY) {
                    value = 0;
                } else if (data_type === consts.DATE || data_type === consts.DATETIME) {
                    value = '';
                } else if (data_type === consts.BOOLEAN) {
                    value = false;
                }
            }
            if (data_type === consts.FLOAT) {
                value = Number(value.toFixed(10));
            }
            if (data_type === consts.CURRENCY) {
                value = Number(value.toFixed(2));
            }
            return value;
        }

        function compare_records(rec1, rec2) {
            var i,
                field,
                data_type,
                index,
                result,
                val1,
                val2;
            for (var i = 0; i < field_names.length; i++) {
                field = self.field_by_name(field_names[i]);
                index = field.bind_index;
                if (field.lookup_item) {
                    index = field.lookup_index;
                }
                data_type = field.lookup_data_type;
                val1 = convert_value(rec1[index], data_type);
                val2 = convert_value(rec2[index], data_type);
                if (val1 < val2) {
                    result = -1;
                }
                if (val1 > val2) {
                    result = 1;
                }
                if (result) {
                    if (desc[i]) {
                        result = -result;
                    }
                    return result;
                }
            }
            return 0;
        }

        this._dataset.sort(compare_records);
        this._do_after_scroll();
        this.update_controls();
    }

    search() {
        let args = this._check_args(arguments),
            callback = args['function'],
            paginating = args['boolean'],
            field_name = arguments[0],
            text = arguments[1].trim(),
            filter_type = consts.FILTER_CONTAINS_ALL;
        if (arguments.length > 2 && typeof arguments[2] === "string") {
            let filter = arguments[2];
            filter_type = consts.filter_value.indexOf(filter) + 1;
        }
        //if (!this.paginate && this.master || this.virtual_table) {
	if (this.virtual_table) {
            this._search_detail(field_name, text, callback);
        }
        else {
            this._pagination_search(field_name, text, filter_type, callback, paginating);
        }
    }

    _search_detail(field_name, text, callback) {
        console.log('_search_detail')
        let clone = this.clone(),
            field = clone.field_by_name(field_name),
            search_text = text.toLowerCase(),
            rec_no;
        if (search_text) {
            clone.each(function(c) {
                if (field.display_text.toLowerCase().includes(search_text)) {
                    rec_no = c.rec_no;
                    return false;
                }
            });
            if (rec_no !== undefined) {
                this.rec_no = rec_no;
            }
        }
    }

    _pagination_search(field_name, text, filter_type, callback, paginating) {
        let search_text = text,
            field,
            i, j,
            index,
            ids,
            substr,
            str,
            found,
            lookup_values,
            params = {};
        field = this.field_by_name(field_name);
        if (field) {
            if (text && field.lookup_values) {
                lookup_values = this.field_by_name(field_name).lookup_values;
                ids = [];
                if (text.length) {
                    for (i = 0; i < lookup_values.length; i++) {
                        str = lookup_values[i][1].toLowerCase();
                        substr = text.toLowerCase().split(' ');
                        found = true;
                        for (j = 0; j < substr.length; j++) {
                            if (substr[j]) {
                                if (str.indexOf(substr[j]) === -1) {
                                    found = false;
                                    break;
                                }
                            }
                        }
                        if (found) {
                            ids.push(lookup_values[i][0])
                        }
                    }
                }
                if (!ids.length) {
                    ids.push(-1);
                }
                text = ids;
                filter_type = consts.FILTER_IN;
            }
            else if (field.numeric_field() && (
                filter_type === consts.FILTER_CONTAINS ||
                filter_type === consts.FILTER_STARTWITH ||
                filter_type === consts.FILTER_ENDWITH ||
                filter_type === consts.FILTER_CONTAINS_ALL)) {
                text = text.replace(task.locale.DECIMAL_POINT, ".");
                text = text.replace(task.locale.MON_DECIMAL_POINT, ".");
                if (text && isNaN(text)) {
                    this.alert_error(task.language.invalid_value.replace('%s', ''));
                    throw new Error(task.language.invalid_value.replace('%s', ''));
                }
            }
            params.__search = undefined;
            if (text.length) {
                params.__search = [field_name, text, filter_type, search_text];
            }
            if (paginating) {
                this._reopen(0, params, callback);
            }
            else {
                this.open({params: params}, callback);
            }
            return [field_name, text, consts.filter_value[filter_type - 1]];
        }
    }

    new_record() {
        var result = [];
        this.each_field(function(field, i) {
            if (!field.master_field) {
                result.push(null);
            }
        });
        if (this.expanded) {
            this.each_field(function(field, i) {
                if (field.lookup_item) {
                    result.push(null);
                }
            });
        }
        return result;
    }

    append(index) {
        this._edit_masters();
        this._append(index);
    }

    _append(index) {
        if (!this._active) {
            throw new Error(task.language.append_not_active.replace('%s', this.item_name));
        }
        if (this._applying) {
            throw new Error('Can not perform this operation. Item is applying data to the database');
        }
        if (this.on_before_append) {
            this.on_before_append.call(this, this);
        }
        this._do_before_scroll();
        this.item_state = consts.STATE_INSERT;
        if (index === 0) {
            this._dataset.splice(0, 0, this.new_record());
        }
        else {
            this._dataset.push(this.new_record());
            index = this._dataset.length - 1;
        }
        this.skip(index, false);
        this._do_after_scroll();
        this.record_status = consts.RECORD_INSERTED;
        if (this.master_field) {
            this._master_field_field.data = this.owner._primary_key_field.value;
        }
        for (var i = 0; i < this.fields.length; i++) {
            if (this.fields[i].default_value !== undefined) {
                this.fields[i].assign_default_value();
            }
        }
        this._modified = false;
        if (this.on_after_append) {
            this.on_after_append.call(this, this);
        }
        this.update_controls();
    }

    insert() {
        this.append(0);
    }

    _do_before_edit() {
        if (this.on_before_edit) {
            this.on_before_edit.call(this, this);
        }
    }

    _do_after_edit() {
        if (this.on_after_edit) {
            this.on_after_edit.call(this, this);
        }
    }

    _edit_masters() {
        if (this.master) {
            this.master._edit_masters();
            if (!this.master.is_changing()) {
                this.master._edit();
            }
        }
    }

    edit() {
        this._edit_masters();
        this._edit();
    }

    _edit() {
        if (this.item_state === consts.STATE_EDIT) {
            return
        }
        if (!this._active) {
            throw new Error(task.language.edit_not_active.replace('%s', this.item_name));
        }
        if (this._applying) {
            throw new Error('Can not perform this operation. Item is applying data to the database');
        }
        if (this.record_count() === 0) {
            throw new Error(task.language.edit_no_records.replace('%s', this.item_name));
        }
        if (this.item_state !== consts.STATE_BROWSE) {
            throw new Error(task.language.edit_not_browse.replace('%s', this.item_name));
        }
        this._do_before_edit();
        this._buffer = this.change_log.store_record();
        this._modified_buffer = this._store_modified()
        this.item_state = consts.STATE_EDIT;
        this._do_after_edit();
    }

    cancel() {
        var i,
            len,
            modified = this._modified,
            self = this,
            prev_state;
        if (this.on_before_cancel) {
            this.on_before_cancel.call(this, this);
        }
        this._canceling = true;
        try {
            if (this.item_state === consts.STATE_EDIT) {
                this.change_log.restore_record(this._buffer)
                this.update_controls();
                for (var i = 0; i < this.details.length; i++) {
                    this.details[i].update_controls(consts.UPDATE_OPEN);
                }
            } else if (this.item_state === consts.STATE_INSERT) {
                this.change_log.record_status = consts.RECORD_UNCHANGED;
                this._dataset.splice(this.rec_no, 1);
            } else {
                throw new Error(task.language.cancel_invalid_state.replace('%s', this.item_name));
            }

            prev_state = this.item_state;
            this.item_state = consts.STATE_BROWSE;
            this.skip(this._old_row, false);
            this._modified = false;
            if (prev_state === consts.STATE_EDIT) {
                this._restore_modified(this._modified_buffer);
            }
            else if (prev_state === consts.STATE_INSERT) {
                this.modified = false;
                this._do_after_scroll();
            }
            if (this.on_after_cancel) {
                this.on_after_cancel.call(this, this);
            }
            if (modified && this.details.length) {
                this.each_detail(function(d) {
                    self._detail_changed(d);
                });
            }
            this.update_controls();
        }
        finally {
            this._canceling = false;
        }
    }

    delete() {
        this._edit_masters();
        this._delete();
    }

    _delete() {
        var rec = this.rec_no;
        if (!this._active) {
            throw new Error(task.language.delete_not_active.replace('%s', this.item_name));
        }
        if (this._applying) {
            throw new Error('Can not perform this operation. Item is applying data to the database');
        }
        if (this.record_count() === 0) {
            throw new Error(task.language.delete_no_records.replace('%s', this.item_name));
        }
        try {
            if (this.on_before_delete) {
                this.on_before_delete.call(this, this);
            }
            this._do_before_scroll();
            this.item_state = consts.STATE_DELETE;
            this.change_log.log_change();
            if (this.master) {
                this.master._set_modified(true);
            }
            this._dataset.splice(rec, 1);
            this.skip(rec, false);
            this.item_state = consts.STATE_BROWSE;
            this._do_after_scroll();
            if (this.on_after_delete) {
                this.on_after_delete.call(this, this);
            }
            if (this.master || this.master_field) {
                this.owner._detail_changed(this, true);
            }
        } catch (e) {
            console.error(e);
            throw new Error(e);
        } finally {
            this.item_state = consts.STATE_BROWSE;
        }
        this.update_controls();
    }

    is_browsing() {
        return this.item_state === consts.STATE_BROWSE;
    }

    is_changing() {
        return (this.item_state === consts.STATE_INSERT) || (this.item_state === consts.STATE_EDIT);
    }

    is_new() {
        return this.item_state === consts.STATE_INSERT;
    }

    is_edited() {
        return this.item_state === consts.STATE_EDIT;
    }

    is_deleting() {
        return this.item_state === consts.STATE_DELETE;
    }

    detail_by_ID(ID) {
        var result;
        if (typeof ID === "string") {
            ID = parseInt(ID, 10);
        }
        this.each_detail(function(detail, i) {
            if (detail.ID === ID) {
                result = detail;
                return false;
            }
        });
        return result;
    }

    post(callback) {
        var data,
            i,
            len,
            old_state = this.item_state,
            was_modified = this._modified;

        if (!this.is_changing()) {
            throw new Error(this.item_name + ' post method: dataset is not in edit or insert mode');
        }
        this.check_record_valid();
        if (this.on_before_post) {
            this.on_before_post.call(this, this);
        }
        if (this.master && this._master_id) {
            this.field_by_name(this._master_id).data = this.master.ID;
        }
        len = this.details.length;
        for (i = 0; i < len; i++) {
            if (this.details[i].is_changing()) {
                this.details[i].post();
            }
        }
        if (this._modified || this.is_new()) {
            if (this.change_log) {
                this.change_log.log_change();
            }
        }
        this._modified = false;
        this.item_state = consts.STATE_BROWSE;
        if (this.on_after_post) {
            this.on_after_post.call(this, this);
        }
        if (!this._valid_record()) {
            this._search_record(this.rec_no, 0);
            this.update_controls(consts.UPDATE_CONTROLS);
        }
        if ((this.master || this.master_field) && was_modified) {
            this.owner._detail_changed(this, true);
        }
    }

    _do_before_apply_handler(item, caller, params) {
        let cur_params = {}
        if (item == caller) {
            cur_params = params;
        }
        if (item.on_before_apply) {
            item.on_before_apply.call(item, item, cur_params);
        }
        return cur_params;
    }

    _do_before_apply(caller, params) {
        let item = caller,
            result = {};
        result[item.ID + ''] = this._do_before_apply_handler(item, caller, params);
        while (item.master) {
            item = item.master;
            result[item.ID + ''] = this._do_before_apply_handler(item, caller, params);
        }
        return result;
    }

    _do_after_apply(caller) {
        let item = caller;
        if (item.on_after_apply) {
            item.on_after_apply.call(item, item);
        }
        while (item.master) {
            item = item.master;
            if (item.on_after_apply) {
                item.on_after_apply.call(item, item);
            }
        }
    }

    apply() {
        let args = this._check_args(arguments),
            caller = args['item'],
            callback = args['function'],
            params = args['object'],
            async = args['boolean'],
            self = this,
            changes = {},
            result,
            data;
        if (this.master) {
            if (this.master_applies) {
                if (callback) {
                    callback.call(this);
                }
                return;
            }
            let item = this;
            while (item.master) {
                if (item.is_changing()) {
                    item.post();
                }
                item = item.master;
            }
            result = item.apply(this, params, callback);
            return
        }
        if (!caller) {
            caller = this;
        }
        if (this._applying) {
            if (callback) {
                callback.call(caller, 'The data is currently stored in the database.');
            }
            return;
        }
        if (this.is_changing()) {
            this.post();
        }
        if (this.change_log && this.change_log.get_changes(changes)) {
            params = $.extend({}, params);
            let params_dict = this._do_before_apply(caller, params);
            this._applying = true;
            if (callback || async) {
                this.send_request('apply', [changes, params_dict], function(data) {
                    self._process_apply(caller, data, callback);
                });
            } else {
                data = this.send_request('apply', [changes, params_dict]);
                result = this._process_apply(caller, data);
            }
        }
        else if (callback) {
            if (callback) {
                callback.call(caller);
            }
        }
        return result;
    }

    _process_apply(caller, response, callback) {
        this._applying = false;
        if (response) {
            let data = response[0],
                error = response[1];
            if (error) {
                if (callback) {
                    callback.call(caller, error);
                }
                throw new Error(error);
            }
            else {
                this.change_log.update(data);
                this._do_after_apply(caller);
                if (callback) {
                    callback.call(caller);
                }
                this.update_controls(consts.UPDATE_APPLIED);
                if (caller.master) {
                    caller.master._detail_changed(caller);
                }
                return data;
            }
        }
    }

    field_by_id(id_value, fields, callback) {
        var copy,
            values,
            result;
        if (typeof fields === 'string') {
            fields = [fields];
        }
        copy = this.copy();
        copy.set_where({
            id: id_value
        });
        if (callback) {
            copy.open({
                expanded: false,
                fields: fields
            }, function() {
                values = copy._dataset[0];
                if (fields.length === 1) {
                    values = values[0];
                }
                return values
            });
        } else {
            copy.open({
                expanded: false,
                fields: fields
            });
            if (copy.record_count() === 1) {
                values = copy._dataset[0];
                if (fields.length === 1) {
                    values = values[0];
                }
                return values
            }
        }
    }

    locate(fields, values) {
        var clone = this.clone();

        function record_found() {
            var i,
                len;
            if (fields instanceof Array) {
                len = fields.length;
                for (i = 0; i < len; i++) {
                    if (clone.field_by_name(fields[i]).value !== values[i]) {
                        return false;
                    }
                }
                return true;
            } else {
                if (clone.field_by_name(fields).value === values) {
                    return true;
                }
            }
        }

        clone.first();
        while (!clone.eof()) {
            if (record_found()) {
                this.rec_no = clone.rec_no;
                return true;
            }
            clone.next();
        }
    }

    get active() {
        return this._active;
    }

    get virtual_table() {
        if (this.master) {
            return task.item_by_ID(this.prototype_ID).virtual_table;
        }
        else {
            return this._virtual_table;
        }
    }

    get paginate() {
        return this._paginate
    }

    set paginate(value) {
        this._paginate = value;
    }

    set read_only(value) {
        var self = this;
        this._read_only = value;
        this.each_field(function(field) {
            field.update_controls();
        });
        this.each_detail(function(detail) {
            detail.update_controls();
        });
    }

    get read_only() {
        if (!this._read_only && (this.master || this.master_field) && this.owner.owner_read_only) {
            return this.owner.read_only;
        } else {
            return this._read_only;
        }
    }

    get can_modify() {
        var result = this._can_modify;
        if (this.master && !this.master._can_modify) {
            result = false;
        }
        return result;
    }

    set can_modify(value) {
        this._can_modify = value;
    }

    get filtered() {
        return this._filtered;
    }

    set filtered(value) {
        if (value) {
            if (!this.on_filter_record) {
                value = false;
            }
        }
        if (this._filtered !== value) {
            this._filtered = value;
            this.first();
            this.update_controls(consts.UPDATE_OPEN);
        }
    }

    clear_filters() {
        this.each_filter(function(filter) {
            filter.value = null;
        })
    }

    assign_filters(item) {
        var self = this;
        item.each_filter(function(f) {
            if (f.value === null) {
                self.filter_by_name(f.filter_name).field.value = null;
            } else {
                self.filter_by_name(f.filter_name).field.value = f.field.value;
            }
        });
    }

    set item_state(value) {
        if (this._state !== value) {
            this._state = value;
            if (this.on_state_changed) {
                this.on_state_changed.call(this, this);
            }
            this.update_controls(consts.UPDATE_STATE);
        }
    }

    get item_state() {
        return this._state;
    }

    _do_after_scroll() {
        var len = this.details.length,
            detail;
        for (var i = 0; i < len; i++) {
            this.details[i]._do_close();
        }
        this.update_controls(consts.UPDATE_SCROLLED);
        if (this.on_after_scroll) {
            this.on_after_scroll.call(this, this);
        }
        if (this._on_after_scroll_internal) {
            this._on_after_scroll_internal.call(this, this);
        }
    }

    _do_before_scroll() {
        if (this.is_changing()) {
            this.post();
        }
        if (this.on_before_scroll) {
            this.on_before_scroll.call(this, this);
        }
        if (this._on_before_scroll_internal) {
            this._on_before_scroll_internal.call(this, this);
        }
    }

    skip(value, trigger_events) {
        var eof,
            bof,
            old_row,
            new_row;
        if (trigger_events === undefined) {
            trigger_events = true;
        }
        if (this.record_count() === 0) {
            if (trigger_events) this._do_before_scroll();
            this._cur_row = null;
            this._eof = true;
            this._bof = true;
            if (trigger_events) this._do_after_scroll();
        } else {
            old_row = this._cur_row;
            eof = false;
            bof = false;
            new_row = value;
            if (new_row < 0) {
                new_row = 0;
                bof = true;
            }
            if (new_row >= this._dataset.length) {
                new_row = this._dataset.length - 1;
                eof = true;
            }
            this._eof = eof;
            this._bof = bof;
            if (old_row !== new_row) {
                if (trigger_events) this._do_before_scroll();
                this._cur_row = new_row;
                if (trigger_events) this._do_after_scroll();
            }
        }
        this._old_row = this._cur_row;
    }

    set rec_no(value) {
        if (this._active) {
            if (this.filter_active()) {
                this._search_record(value, 0);
            } else {
                this.skip(value);
            }
        }
    }

    get rec_no() {
        return this._cur_row;
    }

    filter_active() {
        if (this.on_filter_record && this.filtered) {
            return true;
        }
    }

    first() {
        if (this.filter_active()) {
            this.find_first();
        } else {
            this.rec_no = 0;
        }
    }

    last() {
        if (this.filter_active()) {
            this.find_last();
        } else {
            this.rec_no = this._dataset.length - 1;
        }
    }

    next() {
        if (this.filter_active()) {
            this.find_next();
        } else {
            this.rec_no = this.rec_no + 1;
        }
    }

    prior() {
        if (this.filter_active()) {
            this.find_prior();
        } else {
            this.rec_no = this.rec_no - 1;
        }
    }

    eof() {
        if (this.active) {
            return this._eof;
        }
        else {
            return true;
        }
    }

    bof() {
        if (this.active) {
            return this._bof;
        }
        else {
            return true;
        }
    }

    _valid_record() {
        if (this.on_filter_record && this.filtered) {
            return this.on_filter_record.call(this, this);
        } else {
            return true;
        }
    }

    _search_record(start, direction) {
        var row,
            cur_row,
            found,
            self = this;
        if (direction === undefined) {
            direction = 1;
        }

        function update_position() {
            if (self.record_count() === 0) {
                self._eof = true;
                self._bof = true;
            } else {
                self._eof = false;
                self._bof = false;
                if (self._cur_row < 0) {
                    self._cur_row = 0;
                    self._bof = true;
                }
                if (self._cur_row >= self._dataset.length) {
                    self._cur_row = self._dataset.length - 1;
                    self._eof = true;
                }
            }
        }

        function check_record() {
            if (direction === 1) {
                return self.eof();
            } else {
                return self.bof();
            }
        }

        if (this.active) {
            if (this.record_count() === 0) {
                this.skip(start);
                return;
            }
            cur_row = this._cur_row;
            this._cur_row = start + direction;
            update_position();
            if (direction === 0) {
                if (this._valid_record()) {
                    this._cur_row = cur_row;
                    this.skip(start);
                    return
                }
                direction = 1;
            }
            while (!check_record()) {
                if (this._valid_record()) {
                    if (start !== this._cur_row) {
                        row = this._cur_row;
                        this._cur_row = start;
                        this.skip(row);
                        found = true;
                        break
                    }
                } else {
                    this._cur_row = this._cur_row + direction;
                    update_position();
                }
            }
            if (!found) {
                this._cur_row = cur_row;
            }
        }
    }

    find_first() {
        this._search_record(-1, 1);
    }

    find_last() {
        this._search_record(this._dataset.length, -1);
    }

    find_next() {
        this._search_record(this.rec_no, 1);
    }

    find_prior() {
        this._search_record(this.rec_no, -1);
    }

    _count_filtered() {
        var clone = this.clone(true),
            result = 0;
        clone.each(function() {
            result += 1;
        })
        return result;
    }

    get rec_count() {
        if (this._dataset) {
            if (this.filtered) {
                return this._count_filtered();
            }
            else {
                return this._dataset.length;
            }
        } else {
            return 0;
        }
    }

    record_count() {
        if (this._dataset) {
            return this._dataset.length;
        } else {
            return 0;
        }
    }

    get _record_copy() {
        let self = this,
            fields = {},
            details = {},
            result = {record: fields, details: details};
        this.each_field(function(f) {
            if (!f.system_field()) {
                let field = self.field_by_name(f.field_name);
                fields[f.field_name] = [field.data, field.lookup_data]
            }
        });
        this.each_detail(function(d) {
            let records = [],
                clone = d.clone();
            details[d.ID] = records;
            clone.each(function(c) {
                records.push(c._record_copy);
            });
        });
        return result;
    }

    set _record_copy(copy) {
        let self = this,
            handlers = this.store_handlers();
        try {
            this.clear_handlers();
            this.each_field(function(f) {
                let vals = copy.record[f.field_name];
                if (vals) {
                    f.data = vals[0];
                    f.lookup_data = vals[1];
                }
            });
            this.each_detail(function(d) {
                let records = copy.details[d.ID],
                    handlers = d.store_handlers();
                d.clear_handlers();
                d.disable_controls();
                try {
                    records.forEach(function(record) {
                        if (!d.active) {
                            d.open();
                        }
                        d.append();
                        d._record_copy = record;
                        d.post();
                    });
                    d.first();
                }
                finally {
                    d.enable_controls();
                    d.load_handlers(handlers);
                }
            })
        }
        finally {
            this.load_handlers(handlers);
        }
    }

    copy_record() {
        let args = this._check_args(arguments),
            options = args['object'],
            container = args['jquery'],
            on_detail_changed = this.on_detail_changed,
            on_after_scroll_internal = this._on_after_scroll_internal;
        options = $.extend({}, options);
        options.rec_copy = this._record_copy;
        this.on_detail_changed = function() {};
        this._on_after_scroll_internal = undefined;
        try {
            this.insert_record(container, options);
        }
        finally {
            this._on_after_scroll_internal = on_after_scroll_internal;
            this.on_detail_changed = on_detail_changed;
        }
    }

    insert_record() {
        let args = this._check_args(arguments),
            options = args['object'],
            container = args['jquery'];
        this._do_append_record(container, options, 0);
    }

    append_record() {
        let args = this._check_args(arguments),
            options = args['object'],
            container = args['jquery'];
        this._do_append_record(container, options);
    }


    _do_append_record(container, options, index) {
        container = this._check_container(container);
        if (container && this.task.can_add_tab(container) && $('.modal').length === 0) {
            this._append_record_in_tab(container, options);
        }
        else {
            this._append_record(container, options, index);
        }
    }

    _append_record(container, options, index) {
        if (this.can_create()) {
            options = $.extend({}, options);
            this.append(index);
            if (options.rec_copy) {
                this._record_copy = options.rec_copy;
                if (options.after_record_copied) {
                    options.after_record_copied.call(this, this);
                }
            }
            else {
                this.open_details({details: this.edit_options.edit_details});
            }
            this.create_edit_form(container);
        }
    }

    _append_record_in_tab(container, options) {
        var tab_id = this.item_name + 0,
            tab,
            tab_name,
            self = this,
            copy = this.copy(),
            content;
        options = $.extend({}, options);
        if (options) {
            tab_name = options.tab_name;
        }
        container = this._check_container(container);
        if (this.can_create()) {
            if (!tab_name) {
                tab_name = '<i class="icon-plus-sign"></i> ' + this.item_caption;
            }
            content = task.add_tab(container, tab_name,
                {
                    tab_id: tab_id,
                    insert_after_cur_tab: true,
                    show_close_btn: true,
                    set_active: true,
                    on_close: function() {
                        task.show_tab(container, tab_id);
                        copy.close_edit_form();
                    }
                });
            if (content) {
                copy._source_item = this;
                copy._tab_info = {container: container, tab_id: tab_id}
                copy.open({open_empty: true}, function() {
                    let on_after_apply = copy.on_after_apply;
                    this.edit_options.edit_details
                    copy.edit_options.tab_id = tab_id;
                    copy._append_record(content, options);
                    copy.on_after_apply = function(item) {
                        if (on_after_apply) {
                            on_after_apply(copy, copy);
                        }
                        self.refresh(true);
                    }
                });
            }
        }
    }

    _check_container(container) {
        if (container && container.length) {
            return container;
        }
        else if (!container && this.edit_options.modeless &&
            this.task.forms_in_tabs && this.task.forms_container) {
            return this.task.forms_container;
        }
    }

    edit_record(container, options) {
        if (this.rec_count) {
            container = this._check_container(container);
            if ($('.modal').length === 0 && container && this.task.can_add_tab(container)) {
                this._edit_record_in_tab(container, options)
            }
            else {
                this._edit_record()
            }
        }
    }

    _edit_record(container, in_tab) {
        var self = this,
            options = {},
            create_form = function() {
                if (self.can_edit() && !self.is_changing()) {
                    self.edit();
                }
                self.create_edit_form(container);
            };
        if (this.master) {
            create_form();
        }
        else {
            options.details = this.edit_options.edit_details;
            options.default_order = true;
            if (!in_tab) {
                if (this.log_changes) {
                    this.refresh_record(options, function(error) {
                        create_form()
                    });
                }
                else (
                    create_form()
                )
            }
            else if (this.edit_options.edit_details.length) {
                options.filters = this.edit_options.edit_detail_filters;
                this.open_details(options, function(error) {
                    create_form()
                });
            }
            else {
                create_form();
            }
        }
    }

    _edit_record_in_tab(container, options) {
        var pk = this._primary_key,
            pk_value = this.field_by_name(pk).value,
            where = {},
            params = {},
            tab_name,
            tab_id = this.item_name + pk_value,
            tab,
            self = this,
            copy = this.copy(),
            content;
        options = $.extend({}, options);
        if (options) {
            tab_name = options.tab_name;
        }
        if (!tab_name) {
            tab_name = '<i class="bi bi-pencil-square"></i> ' + this.item_caption;
        }
        content = task.add_tab(container, tab_name,
        {
            tab_id: tab_id,
            insert_after_cur_tab: true,
            show_close_btn: true,
            set_active: true,
            on_close: function() {
                task.show_tab(container, tab_id);
                copy.close_edit_form();
            }
        });
        if (content) {
            copy._source_item = this;
            copy._read_only = this._read_only;
            copy.owner_read_only = this.owner_read_only;
            copy.each_field(function(f) {
                f._read_only = self.field_by_name(f.field_name)._read_only;
            });
            copy._tab_info = {container: container, tab_id: tab_id}
            copy.can_modify = this.can_modify;
            where[pk] = pk_value;
            copy.set_where(where);
            copy.edit_options.edit_detail_filters = {};
            this.each_detail(function(d) {
                if (d._open_params.__filters) {
                    copy.edit_options.edit_detail_filters[d.item_name] = d._open_params.__filters.slice();
                }
            });
            copy.open({params: params}, function() {
                var on_after_apply = copy.on_after_apply;
                copy.edit_options.tab_id = tab_id;
                copy._edit_record(content, true);
                copy.on_after_apply = function(item) {
                    if (on_after_apply) {
                        on_after_apply(copy, copy);
                    }
                    self.refresh(true);
                    self.update_controls(consts.UPDATE_APPLIED);
                }
            });
        }
    }

    record_is_edited(show) {
        var pk = this._primary_key,
            pk_value = this.field_by_name(pk).value,
            tab_id = this.item_name + pk_value,
            i,
            item;
        for (i = 0; i < task._edited_items.length; i++) {
            item = task._edited_items[i];
            if (item.ID === this.ID) {
                if (item._tab_info.tab_id === tab_id) {
                    if (show) {
                        task.show_tab(item._tab_info.container, item._tab_info.tab_id);
                    }
                    return true;
                }
            }
        }
    }

    cancel_edit() {
        if (this.is_changing()) {
            this.cancel();
        }
        this.close_edit_form();
        if (this.view_form && !this._applied) {
            this.refresh();
        }
    }

    _do_after_delete_record(master_changing, callback) {
        if (master_changing) {
            this.master.edit();
        }
        if (callback) {
            callback.call(this, this);
        }
    }

    delete_record() {
        let self = this,
            args = this._check_args(arguments),
            callback = args['function'],
            master_changing = this.master && this.master.is_changing();
        if (this.can_delete()) {
            if (this.rec_count > 0) {
                let mess = this.question(task.language.delete_record,
                    function() {
                        self.delete();
                        self.apply(function(e) {
                            var error;
                            self.hide_message(mess);
                            if (e) {
                                error = (e + '').toUpperCase();
                                if (error && (error.indexOf('FOREIGN KEY') !== -1 ||
                                    error.indexOf('INTEGRITY CONSTRAINT') !== -1 ||
                                    error.indexOf('REFERENCE CONSTRAINT') !== -1
                                    )
                                ) {
                                    self.alert_error(task.language.cant_delete_used_record);
                                } else {
                                    self.alert_error(e);
                                }
                            }
                            if (!(self.master && self.master_applies)) {
                                self.refresh(function() {
                                    self._do_after_delete_record(master_changing, callback);
                                });
                            }
                        });
                    },
                    function() {
                        self.hide_message(mess);
                    },
                    null,
                    {hide: false}
                );
            } else {
                this.warning(task.language.no_record);
            }
        }
    }

    check_record_valid() {
        var error;
        this.each_field(function(field, j) {
            let e = field.check_valid();
            if (e) {
                field.update_control_state(e);
                if (!error) {
                    error = e;
                }
            }
        });
        if (error) {
            throw new Error(error);
        }
    }

    check_filters_valid() {
        var error;
        this.each_filter(function(filter, j) {
            try {
                filter.check_valid();
            } catch (e) {
                filter.field.update_control_state(e);
                if (filter.field1) {
                    filter.field1.update_control_state(e);
                }
                if (!error) {
                    error = e;
                }
            }
        });
        if (error) {
            throw new Error(error);
        }
    }

    post_record() {
        this.post();
        this.close_edit_form();
    }

    apply_record() {
        let args = this._check_args(arguments),
            callback = args['function'],
            options = args['object'],
            self = this,
            default_options = {
                close_form: true,
                apply_params: {}
            };
        options = $.extend({}, default_options, options);
        if (this.is_changing()) {
            try {
                this.post();
            }
            catch (e) {
                console.error(e);
                if (!(e.name && e.name === 'AbortError')) {
                    this.alert_error(e);
                }
                if (!this.is_changing()) {
                    this.edit();
                }
                return;
            }
            this.disable_edit_form();
            try {
                this.apply(options.apply_params, function(error) {
                    if (error && error.indexOf('aborted:') !== 0) {
                        self.alert_error(error, {duration: 10});
                        this.enable_edit_form();
                        self.edit();
                    }
                    else {
                        if (callback) {
                            callback.call(self, self);
                        }
                        if (options.close_form) {
                            self.close_edit_form();
                        }
                        else {
                            this.enable_edit_form();
                            self.edit();
                        }
                    }
                });
            }
            catch (e) {
                console.error(e);
                if (!(e.name && e.name === 'AbortError')) {
                    this.alert_error(e);
                }
                if (this.edit_form_disabled()) {
                    this.enable_edit_form();
                    if (!this.is_changing()) {
                        this.edit();
                    }
                }
            }
        }
        else {
            if (options.close_form) {
                this.close_edit_form();
            }
        }
    }

    view_modal(container) { // depricated
        this.is_lookup_item = true;
        this.view(container);
    }

    view(container, options) {
        this._show_selected = false;
        if (container && this.task.can_add_tab(container)) {
            this._view_in_tab(container, options);
        }
        else {
            this._view(container);
        }
    }

    _view(container) {
        var self = this;
        this.load_modules([this, this.owner], function() {
            if (!self._order_by_list.length && self.view_options.default_order) {
                self.set_order_by(self.view_options.default_order);
            }
            if (self.paginate === undefined) {
                if (self.master) {
                    self.paginate = false;
                }
                else {
                    self.paginate = true;
                }
            }
            self.create_view_form(container);
            if (self.view_options.enable_filters) {
                self.init_filters();
            }
        })
    }

    _view_in_tab(container, options) {
        var self = this,
            tab_id = this.item_name,
            content,
            default_options = {
                tab_id: undefined,
                caption: this.item_caption,
                show_close_btn: true
            };

        options = $.extend({}, default_options, options);
        if (options.tab_id) {
            tab_id = tab_id + '_' + options.tab_id;
        }
        content = this.task.add_tab(container, options.caption,
        {
            tab_id: tab_id,
            show_close_btn: options.show_close_btn,
            set_active: true,
            on_close: function() {
                task.show_tab(container, tab_id);
                self.close_view_form();
            }
        });
        if (content) {
            this._tab_info = {container: container, tab_id: tab_id}
            this.view_options.tab_id = tab_id;
            this._view(content);
        }
    }

    create_view_form(container) {
        this._create_form('view', container);
    }

    close_view_form() {
        this._close_form('view');
    }

    create_edit_form(container) {
        this._create_form('edit', container);
    }

    close_edit_form() {
        this._close_form('edit');
    }

    create_filter_form(container) {
        this._create_form('filter', container);
    }

    close_filter_form() {
        this._close_form('filter');
    }

    apply_filters(search_params) {
        var self = this,
            params = {},
            search_field,
            search_value,
            search_type;
        try {
            if (this.on_filters_apply) {
                this.on_filters_apply.call(this, this);
            }
            this.check_filters_valid();
            try {
                if (search_params) {
                    search_field = search_params[0];
                    search_value = search_params[1];
                    search_type = search_params[2];
                    search_type = consts.filter_value.indexOf(search_type) + 1;
                    if (search_value) {
                        params.__search = [search_field, search_value, search_type];
                    }
                }
            }
            catch (e) {
                params = {};
            }
            this._reopen(0, params, function() {
                self.close_filter_form();
            });
        }
        catch (e) {
        }
    }

    get_filter_text() {
        var result = '';
        this.each_filter(function(filter) {
            if (filter.text) {
                result += ' ' + filter.text;
            }
        });
        if (result && task.old_forms) {
            result = task.language.filter + ' -' + result;
        }
        result = this.item.sanitize_html(result);
        return result;
    }

    get_filter_html() {
        var result = '';
        this.each_filter(function(filter) {
            if (filter.get_html()) {
                result += ' ' + filter.get_html();
            }
        });
        return result;
    }

    close_filter() { // depricated
        this.close_filter_form();
    }

    disable_controls() {
        this._disabled_count += 1;
    }

    enable_controls() {
        this._disabled_count -= 1;
        if (this.controls_enabled()) {
            this.update_controls();
        }
    }

    controls_enabled() {
        return this._disabled_count === 0;
    }

    controls_disabled() {
        return !this.controls_enabled();
    }

    update_controls(state) {
        if (state === undefined) {
            state = consts.UPDATE_CONTROLS;
        }
        if (this.controls_enabled()) {
            this.each_field(function(field) {
                field.update_controls(state, true);
            });
            if (this.on_update_controls) {
                this.on_update_controls.call(this, this);
            }
            for (var i = 0; i < this.controls.length; i++) {
                this.controls[i].update(state);
            }
        }
    }

    resize_controls() {
        for (var i = 0; i < this.controls.length; i++) {
            if (this.controls[i].resize) {
                this.controls[i].resize();
            }
        }
        this.each_detail(function(d) {
            d.resize_controls();
        });
    }

    create_view_tables() {
        var table_container = this.view_form.find('.' + this.view_options.table_container_class),
            height,
            details = this.view_options.view_details,
            detail,
            detail_container,
            self = this;
        if (table_container && table_container.length) {
            if (!this.lookup_field && details && details.length) {
                detail_container = this.view_form.find('.' + this.view_options.detail_container_class);
                if (detail_container) {
                    height = this.view_options.detail_height;
                    if (!height) {
                        height = 232;
                    }
                    this.create_detail_table(detail_container, {height: height});
                    this.table_options.height -= height;
                    if (this.table_options.height < 180) {
                        this.table_options.height = 180;
                    }
                }
            }
            if (this.master || this.master_field) {
                this.table_options.height = this.owner.edit_options.detail_height;
                if (!this.table_options.height) {
                    this.table_options.height = 262;
                }
            }
            this.create_table(table_container);
        }
    }

    create_detail_table(container, options) {
        var self = this,
            details = this.view_options.view_details,
            tab_changed = function(tab_index) {
                let index = +tab_index.replace('detail_tab', '');
                if (self._visible_detail) {
                    self._visible_detail.close();
                }
                self._visible_detail = self.find(details[index]);
                self._visible_detail.set_order_by(self._visible_detail.view_options.default_order);
                self._visible_detail.open(true);
            };
        if (details && details.length && container && container.length) {
            let i,
                detail_container = container;
            if (details.length > 1) {
                this.task.init_tabs(container)
            }
            for (i = 0; i < details.length; i++) {
                let detail = this.find(details[i]),
                    detail_container = container,
                    height_delta = 0;
                if (details.length > 1) {
                    detail_container = task.add_tab(container, detail.item_caption,
                        {tab_id: 'detail_tab' + i, on_click: tab_changed});
                    height_delta = 38;
                }
                detail.create_table(detail_container,
                    {
                        editable_fields: [],
                        multiselect: false,
                        height: options.height - height_delta
                    }
                );
            }
            let scroll_timeout;
            this._on_after_scroll_internal = function() {
                if (self.view_form) {
                    clearTimeout(scroll_timeout);
                    scroll_timeout = setTimeout(
                        function() {
                            var detail = self._visible_detail;
                            detail.set_order_by(detail.view_options.default_order);
                            detail.open(true);
                        },
                        100
                    );
                }
            }
            tab_changed('detail_tab0');
        }
    }

    create_detail_views(container, options) {
        var self = this,
            i,
            detail,
            detail_container,
            details;

        if (!container || !container.length) {
            return;
        }

        if (options) {
            details = options.details
        }
        if (!details) {
            details = this.edit_options.edit_details;
        }

        if (details.length) {
            if (details.length > 1) {
                this.task.init_tabs(container)
            }
            for (i = 0; i < details.length; i++) {
                detail = this.find(details[i]);
                detail_container = container;
                if (details.length > 1) {
                    detail_container = task.add_tab(container, detail.item_caption,
                        {tab_id: 'detail_view_tab' + i});
                }
                detail.view_options.form_header = false;
                detail.view_options.form_border = false;
                detail.view_options.close_on_escape = false;
                detail.view(detail_container);
            }
        }
    }

    add_view_button(text, options) {
        var container;
        options = $.extend({}, options);
        if (!options.parent_class_name) {
            if (this.view_form.find('.default-top-view').length) {
                options.parent_class_name = 'form-header';
            }
            else {
                options.parent_class_name = 'form-footer';
            }
        }
        container = this.view_form.find('.' + options.parent_class_name);
        return this.add_button(container, text, options);
    }

    add_edit_button(text, options) {
        var container;
        options = $.extend({}, options);
        if (!options.parent_class_name) {
            if (this.edit_form.find('.default-top-edit').length) {
                options.parent_class_name = 'form-header';
            }
            else {
                options.parent_class_name = 'form-footer';
            }
        }
        container = this.edit_form.find('.' + options.parent_class_name);
        return this.add_button(container, text, options);
    }

    add_button(container, text, options) {
        var default_options = {
                btn_id: undefined,
                btn_class: undefined,
                image: undefined,
                type: undefined,
                secondary: false,
                expanded: true,
                shortcut: undefined
            },
            right_aligned,
            btn,
            result;
        if (!container.length) {
            return $();
        }
        right_aligned = container.hasClass('form-footer');
        options = $.extend({}, default_options, options);
        if (options.pull_left) { // for compatibility with previous versions
            options.secondary = options.pull_left;
        }
        if (!text) {
            text = 'Button';
        }
        result = $('<button class="btn" type="button"></button>')
        if (options.expanded) {
            result.addClass('expanded-btn')
        }
        if (options.btn_id) {
            result.attr('id', options.btn_id);
        }
        if (options.btn_class) {
            result.addClass(options.btn_class);
        }
        if (options.secondary) {
            if (right_aligned) {
                result.addClass('pull-left');
            }
            else {
                result.addClass('pull-right');
            }
        }
        if (options.type) {
            result.addClass('btn-' + options.type);
        }
        else {
            result.addClass('btn-secondary');
        }
        if (options.image && options.shortcut) {
            result.html('<i class="' + options.image + '"></i> ' + text + '<small class="muted">&nbsp;[' + options.shortcut + ']</small>')
        }
        else if (options.image) {
            result.html('<i class="' + options.image + '"></i> ' + text)
        }
        else if (options.shortcut) {
            result.html(' ' + text + '<small class="muted">&nbsp;[' + options.shortcut + ']</small>')
        }
        else {
            result.html(' ' + text)
        }
        if (right_aligned) {
            if (options.secondary) {
                container.append(result);
            }
            else {
                btn = container.find('> .btn:not(.pull-left):first');
                if (btn.length) {
                    btn.before(result);
                }
                else {
                    container.append(result)
                }
            }
        }
        else {
            if (options.secondary) {
                btn = container.find('> .btn.pull-right:last');
                if (btn.length) {
                    btn.after(result);
                }
                else {
                    container.append(result)
                }
            }
            else {
                btn = container.find('> .btn:not(.pull-right):last');
                if (btn.length) {
                    btn.after(result);
                }
                else {
                    container.append(result);
                }
            }
        }
        return result;
    }

    select_records(field_name, all_records) {
        var self = this,
            field = this.field_by_name(field_name),
            source,
            can_select = this.can_create();
        if (this.read_only) {
            can_select = false;
        }
        if (this.master && this.master.read_only) {
            can_select = false;
        }
        if (can_select) {
            source = field.lookup_item.copy()
            source.selections = [];
            source.on_view_form_close_query = function() {
                var copy = source.copy(),
                    pk_in = copy._primary_key + '__in',
                    where = {};
                if (source.selections.length) {
                    where[pk_in] = source.selections;
                    copy.set_where(where);
                    copy.lookup_field = field
                    copy.open(function() {
                        var rec_no = self.rec_no,
                            last_rec_no,
                            found,
                            existing_recs = {},
                            pk_field = copy.field_by_name(copy._primary_key),
                            clone = self.clone();
                        self.disable_controls();
                        self.last();
                        self._records_selected = true;
                        last_rec_no = self.rec_no;
                        try {
                            if (!all_records) {
                                clone.each(function(c) {
                                    existing_recs[c[field_name].value] = true;
                                });
                            }
                            copy.each(function(c){
                                if (all_records || !existing_recs[pk_field.value]) {
                                    found = true;
                                    self.append();
                                    c.set_lookup_field_value();
                                    self.post();
                                }
                            });
                        }
                        catch (e) {
                            console.error(e);
                        }
                        finally {
                            if (found) {
                                if (last_rec_no) {
                                    self.rec_no = last_rec_no + 1;
                                }
                                else {
                                    self.first();
                                }
                            }
                            else {
                                self.rec_no = rec_no;
                            }
                            self._records_selected = false;
                            if (self.master) {
                                self.owner._detail_changed(self, true);
                            }
                            self.enable_controls();
                        }
                        self.apply(function() {
                            if (!self.master.is_changing()) {
                                self.master.edit();
                            }
                        });
                    })
                }
            }
            source.lookup_field = field;
            field._do_select_value(source);
            source.view();
        }
    }

    _detail_changed(detail, modified) {
        if (!detail._records_selected) {
            if (modified && !detail.paginate && this.on_detail_changed ||
                detail.controls.length && detail.table_options.summary_fields.length) {
                detail._fields_summary_info = undefined;
                if (modified && this.on_detail_changed) {
                    this.on_detail_changed.call(this, this, detail);
                }
                if (detail._fields_summary_info === undefined) {
                    let self = this;
                    clearTimeout(this._detail_changed_time_out);
                    this._detail_changed_time_out = setTimeout(
                        function() {
                            self.calc_summary(detail);
                        },
                        100
                    );
                }
            }
        }
    }

    calc_summary(detail, fields, callback, summary_fields) {
        var i,
            clone,
            obj,
            field_name,
            field,
            func,
            master_field_name,
            master_field,
            value,
            text,
            sums = [];
        if (detail.paginate) {
            return;
        }
        if (summary_fields === undefined) {
            summary_fields = detail.table_options.summary_fields;
        }
        detail._fields_summary_info = {};
        clone = detail.clone();
        if (this.on_detail_changed) {
            if (fields instanceof Array && fields.length) {
                for (i = 0; i < fields.length; i++) {
                    master_field_name = Object.keys(fields[i])[0];
                    obj = fields[i][master_field_name];
                    field = undefined;
                    if (typeof obj === 'function') {
                        func = obj;
                    }
                    else {
                        field = clone.field_by_name(obj);
                    }
                    master_field = this.field_by_name(master_field_name);
                    sums.push({sum: 0, field: field, func: func, master_field: master_field});
                }
            }
        }
        if (detail.controls.length && summary_fields.length) {
            for (i = 0; i < summary_fields.length; i++) {
                field_name = summary_fields[i];
                field = clone.field_by_name(field_name);
                if (field) {
                    if (clone.rec_count || field.data_type !== consts.CURRENCY) {
                        sums.push({sum: 0, field: field, field_name: field_name});
                    }
                    else {
                        sums.push({sum: null, field: field, field_name: field_name});
                    }
                }
            }
        }
        if (sums.length) {
            clone.each(function(c) {
                for (i = 0; i < sums.length; i++) {
                    if (sums[i].field) {
                        if (sums[i].field.numeric_field()) {
                            sums[i].sum += sums[i].field.value;
                        }
                        else {
                            sums[i].sum += 1;
                        }
                    }
                    else if (sums[i].func) {
                        sums[i].sum += sums[i].func(c);
                    }
                }
            });
            for (i = 0; i < sums.length; i++) {
                master_field = sums[i].master_field;
                if (master_field && this.is_changing()) {
                    value = sums[i].sum;
                    if (master_field.value !== value) {
                        master_field.value = value;
                    }
                }
                else {
                    field_name = sums[i].field_name;
                    field = sums[i].field;
                    value = sums[i].sum;
                    if (field_name) {
                        text = value + '';
                        if (field.data_type === consts.CURRENCY) {
                            text = field.cur_to_str(value)
                        }
                        else if (field.data_type === consts.FLOAT) {
                            text = field.float_to_str(value)
                        }
                        detail._fields_summary_info[field_name] = {text: text, value: value};
                    }
                }
            }
            if (!$.isEmptyObject(detail._fields_summary_info)) {
                detail.update_controls(consts.UPDATE_SUMMARY);
            }
            if (callback) {
                callback.call(this, this);
            }
        }
    }

    create_table(container, options) {
        return new DBTable(this, container, options);
    }

    create_tree(container, parent_field, text_field, parent_of_root_value, options) {
        return new DBTree(this, container, parent_field, text_field, parent_of_root_value, options);
    }

    create_bands(tab, container) {
        var i,
            j,
            band,
            field,
            fields,
            div,
            options;
        for (i = 0; i < tab.bands.length; i++) {
            fields = tab.bands[i].fields
            if (fields.length) {
                options = tab.bands[i].options;
                options.fields = fields;
                div = $('<div>')
                container.append(div)
                this.create_inputs(div, options);
            }
        }
    }

    create_tabs(container) {
        var i,
            tabs = this.edit_options.tabs;
        this.task.init_tabs(container, {consistent_height: true});
        for (i = 0; i < tabs.length; i++) {
            this.create_bands(tabs[i], task.add_tab(container,
                tabs[i].name, {tab_id: this.item_name + '_edit_tab_' + i}));
        }
    }

    create_controls(container) {
        var tabs = this.edit_options.tabs;
        container.empty();
        if (tabs.length > 1 || tabs.length === 1 && tabs[0].name) {
            this.create_tabs(container);
        }
        else {
            this.create_bands(tabs[0], container);
        }
    }

    create_inputs(container, options) {
        var default_options,
            i, len, col,
            field,
            fields = [],
            visible_fields = [],
            cols = [],
            tabindex,
            form,
            tabs;

        if (!container.length) {
            return;
        }

        default_options = {
            fields: [],
            col_count: 1,
            label_on_top: false,
            label_width: undefined,
            label_size: 3,
            row_count: undefined,
            autocomplete: false,
            in_well: true,
            tabindex: undefined
        };

        if (options && options.fields && options.fields.length) {
            visible_fields = options.fields
        } else {
            visible_fields = this.edit_options.fields;
        }
        if (visible_fields.length == 0) {
            tabs = this.edit_options.tabs;
            if (tabs) {
                if (tabs.length === 1 && !tabs[0].name && tabs[0].bands.length === 1) {
                    visible_fields = tabs[0].bands[0].fields;
                    default_options = $.extend({}, default_options, tabs[0].bands[0].options);
                }
                else {
                    this.create_controls(container);
                    return;
                }
            }
            else {
                this.each_field(function(f) {
                    if (f.field_name !== f.owner._primary_key && f.field_name !== f.owner._deleted_flag) {
                        visible_fields.push(f.field_name);
                    }
                });
            }
        }
        len = visible_fields.length;
        for (i = 0; i < len; i++) {
            field = this.field_by_name(visible_fields[i]);
            if (field) {
                fields.push(field);
            } else {
                console.error(this.item_name + ' create_entries: there is not a field with field_name - "' + visible_fields[i] + '"');
            }
        }

        options = $.extend({}, default_options, options);

        container.empty();

        form = $(
            '<form class="input-form" autocomplete="off">' +
                '<div class="container">' +
                    '<div class="row">' +
                    '</div>' +
                '</div>' +
            '</form>'
            ).appendTo(container);
        if (options.in_well) {
            form.addClass('well');
        }
        if (options.autocomplete) {
            form.attr("autocomplete", "on")
        }
        else {
            form.attr("autocomplete", "off")
        }
        let row = form.find('div.row')
        form.append(row)
        len = fields.length;
        for (col = 0; col < options.col_count; col++) {
            cols.push($("<div></div>")
            .addClass("col-md-" + 12 / options.col_count)
            .appendTo(row));
        }
        tabindex = options.tabindex;
        if (!options.row_count) {
            options.row_count = Math.ceil(len / options.col_count);
        }
        for (i = 0; i < len; i++) {
            new DBInput(fields[i], i + tabindex,
                cols[Math.floor(i / options.row_count)], options);
        }
    }

    create_filter_inputs(container, options) {
        var default_options,
            i, len, col,
            filter,
            filters = [],
            cols = [],
            tabindex,
            form;

        if (!container.length) {
            return;
        }

        default_options = {
                filters: [],
                col_count: 1,
                label_on_top: false,
                label_width: undefined,
                autocomplete: false,
                in_well: true,
                tabindex: undefined
        };

        options = $.extend({}, default_options, options);

        if (options.filters.length) {
            len = options.filters.length;
            for (i = 0; i < len; i++) {
                filters.push(this.filter_by_name(options.filters[i]));
            }
        } else {
            this.each_filter(function(filter, i) {
                if (filter.visible) {
                    filters.push(filter);
                }
            });
        }
        container.empty();
        form = $(
            '<form class="input-form" autocomplete="off">' +
                '<div class="container">' +
                    '<div class="row">' +
                    '</div>' +
                '</div>' +
            '</form>'
            ).appendTo(container);
        if (options.in_well) {
            form.addClass('well');
        }
        if (options.autocomplete) {
            form.attr("autocomplete", "on")
        }
        else {
            form.attr("autocomplete", "off")
        }
        let row = form.find('div.row')
        form.append(row)
        len = filters.length;
        for (col = 0; col < options.col_count; col++) {
            cols.push($("<div></div>")
            .addClass("col-md-" + 12 / options.col_count)
            .appendTo(row));
        }
        tabindex = options.tabindex;
        if (!tabindex && this.filter_form) {
            tabindex = this.filter_form.tabindex;
            this.filter_form.tabindex += len;
        }
        for (i = 0; i < len; i++) {
            filter = filters[i];
            if (filter.filter_type === consts.FILTER_RANGE) {
                new DBInput(filter.field, i + 1, cols[Math.floor(i % options.col_count)],
                    options, filter.filter_caption + ' ' + task.language.range_from);
                new DBInput(filter.field1, i + 1, cols[Math.floor(i % options.col_count)],
                    options, filter.filter_caption + ' ' + task.language.range_to);
            }
            else {
                new DBInput(filter.field, i + 1, cols[Math.floor(i % options.col_count)],
                    options, filter.filter_caption);
            }
        }
    }

    _find_lookup_value(field, lookup_field) {
        if (lookup_field._owner_is_item()) {
            if (field.lookup_field && field.lookup_field1 &&
                lookup_field.lookup_item1 && lookup_field.lookup_item2) {
                if (field.owner.ID === lookup_field.lookup_item.ID &&
                    field.lookup_item.ID === lookup_field.lookup_item1.ID &&
                    field.lookup_field === lookup_field.lookup_field1 &&
                    field.lookup_item1.ID === lookup_field.lookup_item2.ID &&
                    field.lookup_field1 === lookup_field.lookup_field2) {
                    return field.lookup_value;
                }
            }
            else if (field.lookup_field) {
                if (field.owner.ID === lookup_field.lookup_item.ID &&
                    field.lookup_field === lookup_field.lookup_field1 &&
                    field.lookup_item.ID === lookup_field.lookup_item1.ID) {
                    return field.lookup_value;
                }
            }
            else if (field.field_name === lookup_field.lookup_field &&
                field.owner.ID === lookup_field.lookup_item.ID) {
                return field.lookup_value;
            }
        }
        else  if (field.field_name === lookup_field.lookup_field) {
            return field.lookup_value;
        }
    }

    set_lookup_field_value() {
        if (this.record_count()) {
            var lookup_field = this.lookup_field,
                item_field = this.field_by_name(lookup_field.lookup_field),
                lookup_value = null,
                item = this.lookup_field.owner,
                ids = [],
                slave_field_values = {},
                self = this;

            if (item_field) {
                lookup_value = this._find_lookup_value(item_field, lookup_field);
            }
            if (lookup_field.owner && lookup_field.owner.is_changing && !lookup_field.owner.is_changing()) {
                lookup_field.owner.edit();
            }
            if (this.lookup_field.data_type === consts.KEYS) {
                this.selections = [this._primary_key_field.value];
            }
            else if (lookup_field.multi_select) {
                lookup_field.set_value([this._primary_key_field.value], lookup_value);
            } else {
                if (item) {
                    item.each_field(function(item_field) {
                        if (item_field.master_field === lookup_field) {
                            self.each_field(function(field) {
                                var lookup_value
                                if (field.lookup_value) {
                                    lookup_value = self._find_lookup_value(field, item_field);
                                    if (lookup_value) {
                                        slave_field_values[item_field.field_name] = lookup_value;
                                        return false;
                                    }
                                }
                            })
                        }
                    });
                }
                lookup_field.set_value(this._primary_key_field.value, lookup_value, slave_field_values, this);
            }
        }
        if (this.lookup_field) {
            this.close_view_form();
        }
    }

    get default_field() { // depricated
        var i = 0;
        if (this._default_field === undefined) {
            this._default_field = null;
            for (i = 0; i < this.fields.length; i++) {
                if (this.fields[i].default) {
                    this._default_field = this.fields[i];
                    break;
                }
            }
        }
        return this._default_field;
    }

    set_edit_fields(fields) {
        this.edit_options.fields = fields;
    }

    set_view_fields(fields) {
        this.view_options.fields = fields;
    }

    copy_record_fields(source, copy_system_fields) {
        let modified = false;
        source.each_field(function(f) {
            let copy_field = !(!copy_system_fields && f.system_field());
            if (copy_field) {
                let field = this.field_by_name(f.field_name)
                if (field && field.data != f.data) {
                    modified = true;
                    field.data = f.data;
                    field.lookup_data = f.lookup_data;
                }
            }
        });
        if (modified) {
            self._modified = true;
        }
    }

    _do_on_refresh_record(copy, options, callback, async) {
        var i,
            len,
            default_options = {
                details: [],
                filters: {},
                default_order: true
            },
        options = $.extend(true, {}, default_options, options);
        if (copy.rec_count === 1 && this.rec_count &&
            copy._primary_key_field.value === this._primary_key_field.value) {
            len = copy._dataset[0].length;
            for (i = 0; i < len; i++) {
                this._dataset[this.rec_no][i] = copy._dataset[0][i];
            }
            this.each_detail(function(d) {
                if (d.active) {
                    if ($.inArray(d.item_name, options.details) === -1)  {
                        options.details.push(d.item_name);
                        if (d._open_params.__filters) {
                            options.filters[d.item_name] = d._open_params.__filters.slice();
                        }
                    }
                }
            });
            this.change_log.record_status = consts.RECORD_UNCHANGED;
            this.update_controls(consts.UPDATE_RECORD);
            if (options.details.length) {
                options.master_refresh_record = true;
                this.open_details(options, callback, async);
            }
            else if (callback) {
                callback.call(this);
            }
        }
        else {
            this.change_log.record_status = consts.RECORD_UNCHANGED;
            for (var i = 0; i < len; i++) {
                this.details[i]._do_close();
            }
            this._dataset.splice(this.rec_no, 1);
            this.rec_no = this.rec_no;
            this.update_controls()
            console.error('Refresh record, the record is not found in the database table.')
        }
    }

    refresh_record(callback) {
        var args = this._check_args(arguments),
            callback = args['function'],
            async = args['boolean'],
            options = args['object'],
            self = this,
            fields = [],
            primary_key = this._primary_key,
            copy;
        if (this.master) {
            console.trace();
            throw new Error('The refresh_record method can not be executed for a detail item');
        }
        if (!this.rec_count) {
            return
        }
        options = $.extend({}, options);
        copy = this.copy({filters: false, details: false, handlers: false});
        if (this._primary_key_field.value) {
            self.each_field(function(field) {
                fields.push(field.field_name)
            })
            copy._where_list = [[primary_key, consts.FILTER_EQ, this._primary_key_field.value, -2]];
            if (callback || async) {
                copy.open({expanded: this.expanded, fields: fields, params: options.params}, function() {
                    self._do_on_refresh_record(copy, options, callback, async);
                });
            } else {
                copy.open({expanded: this.expanded, fields: fields, params: options.params});
                this._do_on_refresh_record(copy, options);
            }
        }
        else if (callback) {
            callback.call(this);
        }
    }

    format_string(str, value) {
        var result = str;
        if (typeof value === 'object') {
            for (var key in value) {
                if (value.hasOwnProperty(key)) {
                    result = result.replace('%(' + key + ')s', value[key] + '')
                }
            }
        }
        else {
            result = result.replace('%s', value + '')
        }
        return result
    }
}

class Detail extends Item {
    constructor(owner, ID, item_name, caption, visible, type, js_filename, master_field) {
        super(owner, ID, item_name, caption, visible, type, js_filename);
        if (owner) {
            this.master_field = master_field;
            this.master = owner;
            owner.details.push(this);
            owner.details[item_name] = this;
        }
    }

    getChildClass() {
        return Detail;
    }
}

export default Item
export {Item, Detail}
