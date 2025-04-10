import consts from "./consts.js";
import Field from "./field.js";

class Filter {
    constructor (owner, info) {
        var self = this,
            field;

        this.owner = owner;
        this.set_info(info);
        if (owner) {
            owner.filters.push(this);
            if (!(this.filter_name in owner.filters)) {
                owner.filters[this.filter_name] = this;
            }
            if (this.field_name) {
                field = this.owner._field_by_ID(this.field_name);
                this.field = this.create_field(field);
                this.field.required = false;
                if (this.field.lookup_values && (typeof this.field.lookup_values === "number")) {
                    this.field.lookup_values = this.owner.task.lookup_lists[this.field.lookup_values];
                }
                this.field.field_help = this.filter_help;
                this.field.field_placeholder = this.filter_placeholder;
                this.field.multi_select_all = this.multi_select_all;
                if (this.filter_type === consts.FILTER_IN || this.filter_type === consts.FILTER_NOT_IN) {
                    this.field.multi_select = true;
                }
                if (this.filter_type === consts.FILTER_RANGE) {
                    this.field1 = this.create_field(field);
                    this.field1.field_help = undefined;
                }
                if (this.field.data_type === consts.BOOLEAN || this.filter_type === consts.FILTER_ISNULL) {
                    this.field.bool_filter = true;
                    this.field.data_type = consts.INTEGER;
                    this.field.lookup_values = [[null, ''], [0, task.language.no], [1, task.language.yes]];
                }
            }
        }
    }

    create_field(field) {
        var result = new Field();
        result.set_info(field.get_info());
        result._read_only = false;
        result.filter = this;
        result._value = null;
        result._lookup_value = null;
        result.field_kind = consts.FILTER_FIELD;
        return result;
    }

    copy(owner) {
        var result = new Filter(owner, this.get_info());
        return result;
    }

    get_info() {
        var i,
            len = consts.filter_attr.length,
            result = [];
        for (i = 0; i < len; i++) {
            result.push(this[consts.filter_attr[i]]);
        }
        return result;
    }

    set_info(info) {
        if (info) {
            var i,
                len = consts.filter_attr.length;
            for (i = 0; i < len; i++) {
                this[consts.filter_attr[i]] = info[i];
            }
        }
    }

    get value() {
        var result;
        if (this.filter_type === consts.FILTER_RANGE) {
            if (this.field.data !== null && this.field1.data !== null) {
                return [this.field.data, this.field1.data];
            }
            else {
                return null;
            }
        }
        else {
            return this.field.data;
        }
    }

    set value(value) {
        this.set_value(value);
    }

    set_value(value, lookup_value) {
        var new_value;
        if (this.filter_type === consts.FILTER_RANGE) {
            if (value === null) {
                this.field.value = null;
                this.field1.value = null;
            }
            else {
                this.field.value = value[0];
                this.field1.value = value[1];
            }
        }
        else if (this.field.bool_filter) {
            if (value !== null) {
                value = value ? 1 : 0;
            }
            this.field.set_value(value, lookup_value);
        }
        else {
            this.field.set_value(value, lookup_value);
        }
    }

    get lookup_value() {
        return this.field.lookup_value;
    }

    set lookup_value(value) {
        this.field.lookup_value = value;
    }

    update(field) {
        var other_field = this.field,
            value;
        if (this.filter_type === consts.FILTER_RANGE) {
            if (field.value !== null) {
                if (field === this.field) {
                    other_field = this.field1;
                }
                if (other_field.data === null) {
                    other_field.value = field.value;
                }
            }
        }
		
		else if (this.filter_type === consts.FILTER_ISNULL) {
			if (field.value === null) {
				field.lookup_value = null;
			}
			
			if (field.value === 0) {
				field.lookup_value = task.language.no;
			}
			
			if (field.value == 1) {
				field.lookup_value = task.language.yes;
			}
		}
    }

    check_valid() {
        var error = this.check_value(this.field);
        if (error) {
            throw new Error(error);
        }
    }

    check_value(field) {
        if (this.filter_type === consts.FILTER_RANGE) {
            if (this.field.data === null && this.field1.data !== null ||
                this.field.data !== null && this.field1.data === null ||
                this.field.value > this.field1.value) {
                return task.language.invalid_range;
            }
        }
    }

    get text() {
        var result = '';
        if (this.visible && this.value != null) {
            result = this.filter_caption + ': ';
            if (this.filter_type === consts.FILTER_RANGE) {
                result += this.field.display_text + ' - ' + this.field1.display_text;
            } else {
                result += this.field.display_text;
            }
        }
        return result;
    }

    get_html() {
        var val,
            result = '';
        if (this.visible && this.value != null) {
            result = this.filter_caption + ': ';
            if (this.filter_type === consts.FILTER_RANGE) {
                val = this.field.display_text + ' - ' + this.field1.display_text;
            } else {
                val = this.field.display_text;
            }
            result += '<b>' + val + '</b>';
        }
        return result;
    }
}

export default Filter
