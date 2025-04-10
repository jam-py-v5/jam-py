import consts from "./consts.js";

const z_index_base = 1050,
    z_index_inc = 2;

class ModalForm {
    constructor(modal_forms, $form_content, options, item, form_type) {
        this.modal_forms = modal_forms;
        this.$form_content = $form_content,
        this.item = item;
        this.form_type = form_type;
        this.options = options;
        this.create_form()
    }

    add_to_dom() {
        this.$active_element = $(':focus');
        this.$modal = $(
            '<div class="modal jam-modal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1">' +
                '<div class="modal-dialog">' +
                    '<div class="modal-content">' +
                        '<div class="modal-body" style="padding: 0">' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
        this.$modal_body = this.$modal.find('.modal-body'),
        this.$modal_content = this.$modal.find('.modal-content');
        this.$modal_dialog = this.$modal.find('.modal-dialog');
        this.$modal_body.append(this.$form_content);
        $('body').append(this.$modal);
        this.$modal_dialog.css('max-width', this.options.width);
    }

    create_modal() {
        let self = this,
            form = this.$modal.get(0);
        this.form_object = new bootstrap.Modal(form);

        form.addEventListener('show.bs.modal', function(event) {
            event.stopPropagation();
            if (self.item) {
                try {
                    self.item._process_event(self.form_type, 'created');
                }
                finally {
                    self.item._set_form_options(self.$form_content, self.options, self.form_type);
                }
            }
            self.$modal_dialog.css('max-width', self.options.width);
        });
        form.addEventListener('shown.bs.modal', function(event) {
            event.stopPropagation();

            self.layout();

            let z_index = z_index_base + self.modal_forms.stack.length * 2 * z_index_inc;
            $(self.form_object._backdrop._element).css("z-index", z_index);
            self.$modal.css("z-index", z_index + z_index_inc);

            self.$modal_dialog.css('max-width', self.options.width);

            if (task.media === 0) {
                self.modal_forms.task._focus_element(self.$form_content);
            }
            if (self.$form_content.on_shown) {
                self.$form_content.on_shown();
            }
            if (self.item) {
                self.item._process_event(self.form_type, 'shown');
            }
        });
        form.addEventListener('hide.bs.modal', function(event) {
            event.stopPropagation();
        });
        form.addEventListener('hidden.bs.modal', function(event) {
            event.stopPropagation();
        });

        this.form_object.show();

        if (this.item) {
            this.item['modal_' + this.form_type + '_object'] = this;

            let key_suffix = this.item._key_suffix(this.form_type, this.options);
            this.$form_content.on("keydown." + key_suffix, function(e) {
                self.item._process_key_event(self.form_type, 'keydown', e)
            });
            this.$form_content.on("keyup." + key_suffix, function(e) {
                self.item._process_key_event(self.form_type, 'keyup', e)
            });
        }

        this.$modal.on('keydown.modalform', function(e) {
            let key = e.which,
                tab_pressed = e.key === 'Tab' || e.keyCode === 9;
            if (tab_pressed) {
                let elements = self.modal_forms.task._focusable_elements(self.$modal);
                if (elements.length) {
                    if (e.shiftKey) {
                        if (document.activeElement === elements[0]) {
                            elements[elements.length - 1].focus();
                            e.preventDefault();
                        }
                    } else {
                        if (document.activeElement === elements[elements.length - 1]) {
                            elements[0].focus();
                            e.preventDefault();
                        }
                    }
                }
            }
            e.stopPropagation();
        });
        this.$modal.on('keyup.modalform', function(e) {
            if (e.which === 27 && self.options.close_on_escape) {
                if (self.item) {
                    self.item._close_form(self.form_type);
                }
                else {
                    self.close_form();
                }
            }
            e.stopPropagation();
        });
        this.$modal.on('keypress.modalform', function(e) {
            e.stopPropagation();
        });


        let header = this.$modal.find('.card-header').get(0);
        if (header) {
            let modal = this.$modal.get(0),
                isDragging = false,
                offset = { x: 0, y: 0 };

            header.style.cursor = "grab";
            header.addEventListener('mousedown', function (e) {
                isDragging = true;
                offset = {
                    x: e.clientX - modal.getBoundingClientRect().left,
                    y: e.clientY - modal.getBoundingClientRect().top
                };
             });

            document.addEventListener('mousemove', function (e) {
                if (!isDragging) return;
                modal.style.left = e.pageX - offset.x + 'px';
                modal.style.top = e.pageY - offset.y + 'px';
                header.style.cursor = "move";
             });

            document.addEventListener('mouseup', function () {
                isDragging = false;
                header.style.cursor = "grab";
            });
        }
    }

    create_form() {
        try {
            this.add_to_dom();
            this.create_modal();
        }
        catch (e) {
            console.error(e);
        }
    }

    close_form() {
        this.modal_forms.destroy_modal_form(this);
    }

    layout() {
        if ($(window).width() > this.modal_forms.task.px_size(this.options.width)) {
            this.$modal_dialog.css('max-width', this.options.width);
            this.$modal_dialog.css('margin-left', 'auto');
            this.$modal_dialog.css('margin-right', 'auto');
        }
        else {
            this.$modal_dialog.css('max-width', 'none');
            this.$modal_dialog.css('margin-left', '0.5rem');
            this.$modal_dialog.css('margin-right', '0.5rem');
        }
        if (this.item) {
            if (this.item.lookup_field) {
                this.$modal_dialog.addClass('modal-dialog-centered');
            }
            else {
                if ($(window).width() >= 992) {
                    this.$modal_dialog.removeClass('modal-dialog-centered-horizontally');
                    this.$modal_dialog.addClass('modal-dialog-centered');
                }
                else {
                    this.$modal_dialog.removeClass('modal-dialog-centered');
                    this.$modal_dialog.addClass('modal-dialog-centered-horizontally');
                }
            }
        }
        else {
            this.$modal_dialog.addClass('modal-dialog-centered');
        }
    }
}

class ModalForms {
    constructor(task) {
        let self = this;
        this.task = task;
        this.stack = [];

        let resize_timeout;
        $(window).on('resize.modalforms', function(){
            if (self.stack.length) {
                resize_timeout && clearTimeout(resize_timeout);
                resize_timeout = setTimeout(function(){
                    for (var i = 0; i < self.stack.length; i++){
                        self.stack[i].layout();
                    }
                }, 100);
            }
        });
    }

    get active_modal_form() {
        if (this.stack.length) {
            return this.stack[this.stack.length - 1];
        }
    }

    create_modal_form($form_content, options, item, form_type) {
        let modal_form = new ModalForm(this, $form_content, options, item, form_type);
        this.stack.push(modal_form);
        return modal_form;
    }

    destroy_modal_form(modal_form) {
        if (modal_form === this.active_modal_form) {
            this.active_modal_form.destroying = true;
            if (modal_form.item) {
                modal_form.item['modal_' + modal_form.form_type + '_object'] = undefined;
            }
            modal_form.form_object.hide();
            modal_form.$modal.remove();
            modal_form.$active_element.focus();
            this.stack.pop();
        }
    }
}

export default ModalForms
