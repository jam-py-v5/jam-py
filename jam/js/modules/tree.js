import consts from "./consts.js";

class DBTree {
    constructor(item, container, parent_field, text_field, parent_of_root_value, options) {
        this.init(item, container, parent_field, text_field, parent_of_root_value, options);
    }

    init(item, container, options) {
        var self = this,
            default_options = {
                id_field: undefined,
                parent_field: undefined,
                text_field: undefined,
                parent_of_root_value: undefined,
                text_tree: undefined,
                on_click: undefined,
                on_dbl_click: undefined
            };
        this.id = item.task.controlId++;
        this.links = {};
        this.item = item;
        this.$container = container;
        this.form = container.closest('.jam-form');
        this.options = $.extend({}, default_options, options);
        this.$element = $('<div class="dbtree ' + this.item.item_name + '" tabindex="0" style="overflow-x:auto; overflow-y:auto;"></div>')
        this.$element.css('position', 'relative');
        this.$element.data('tree', this);
        this.$element.tabindex = 0;
        this.item.controls.push(this);
        this.$element.bind('destroyed', function() {
            self.item.controls.splice(self.item.controls.indexOf(self), 1);
        });
        this.$element.appendTo(this.$container);
        this.height(container.height());
        this.$element.on('focus blur', function(e) {
            self.select_node(self.selected_node, false);
        });
        this.$element.on('keyup', function(e) {
            self.keyup(e);
        })
        this.$element.on('keydown', function(e) {
            self.keydown(e);
        })
        if (item.active && this.$container.width()) {
            this.build();
        }
    }

    form_closing() {
        if (this.form) {
            return this.form.data('_closing');
        }
    }

    height(value) {
        if (value) {
            this.$element.height(value);
        } else {
            return this.$element.height();
        }
    }

    is_focused() {
        return this.$element.get(0) === document.activeElement;
    }

    scroll_into_view() {
        this.select_node(this.selected_node);
    }

    update(state) {
        var recNo,
            self = this,
            row;
        if (this.form_closing()) {
            return;
        }
        switch (state) {
            case consts.UPDATE_OPEN:
                this.build();
                break;
            case consts.UPDATE_SCROLLED:
                this.syncronize();
                break;
            case consts.UPDATE_CONTROLS:
                this.build();
                break;
            case consts.UPDATE_CLOSE:
                this.$element.empty();
                break;
        }
    }

    keydown(e) {
        var self = this,
            $li,
            code = e.keyCode || e.which;
        if (this.selected_node && !e.ctrlKey && !e.shiftKey) {
            switch (code) {
                case 13: //return
                    e.preventDefault();
                    this.toggle_expanded(this.selected_node);
                    break;
                case 38: //up
                    e.preventDefault();
                    $li = this.selected_node.prev();
                    if ($li.length) {
                        this.select_node($li);
                    } else {
                        $li = this.selected_node.parent().parent()
                        if ($li.length && $li.prop("tagName") === "LI") {
                            this.select_node($li);
                        }
                    }
                    break;
                case 40: //down
                    e.preventDefault();
                    if (this.selected_node.hasClass('parent') && !this.selected_node.hasClass('collapsed')) {
                        $li = this.selected_node.find('ul:first li:first')
                        if ($li.length) {
                            this.select_node($li);
                        }
                    } else {
                        $li = this.selected_node.next();
                        if ($li.length) {
                            this.select_node($li);
                        } else {
                            $li = this.selected_node.find('ul:first li:first')
                            if ($li.length) {
                                this.select_node($li);
                            }
                        }
                    }
                    break;
            }
        }
    }

    keyup(e) {
        var self = this,
            code = (e.keyCode ? e.keyCode : e.which);
        if (!e.ctrlKey && !e.shiftKey) {
            switch (code) {
                case 13:
                    break;
                case 38:
                    break;
                case 40:
                    break;
            }
        }
    }

    build_child_nodes(tree, nodes) {
        var i = 0,
            len = nodes.length,
            node,
            id,
            text,
            rec,
            bullet,
            parent_class,
            collapsed_class,
            li,
            ul,
            info,
            children,
            child_len;
        for (i = 0; i < len; i++) {
            node = nodes[i];
            id = node.id;
            text = node.text;
            rec = node.rec;
            bullet = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
                parent_class = "",
                collapsed_class = "",
                children = this.child_nodes[id + ''];
            if (children && children.length) {
                bullet = '<i class="bi bi-chevron-right"></i>'
                //~ bullet = '&#9658;'
                parent_class = ' parent';
                collapsed_class = 'collapsed';
            }
            li = '<li class="' + collapsed_class + parent_class + '" style="list-style: none" data-rec="' + rec + '">' +
                '<div><span class="tree-bullet">' + bullet + '</span>' +
                '<span class="tree-text">' + text + '<span></div>';
            tree += li;
            if (children && children.length) {
                tree += '<ul style="display: none">';
                tree = this.build_child_nodes(tree, children);
                tree += '</ul>';
            }
            tree += '</li>';
            tree += '</li>';
        }
        return tree
    }

    collect_nodes(clone) {
        var id_field = clone[this.options.id_field],
            parent_field = clone[this.options.parent_field],
            text_field = clone[this.options.text_field],
            array;
        this.child_nodes = {};
        clone.first();
        while (!clone.eof()) {
            array = this.child_nodes[parent_field.value + ''];
            if (array === undefined) {
                array = []
                this.child_nodes[parent_field.value + ''] = array;
            }
            array.push({
                'id': id_field.value,
                'text': text_field.display_text,
                'rec': clone.rec_no
            });
            clone.next();
        }
    }

    build() {
        var self = this,
            clone = this.item.clone(),
            tree = '<ul>',
            i,
            len,
            rec,
            info,
            $li,
            $lis,
            nodes;
        clone.on_field_get_text = this.item.on_field_get_text;
        this.collect_nodes(clone);
        this.$element.empty();
        nodes = this.child_nodes[this.options.parent_of_root_value + ''];
        if (nodes && nodes.length) {
            tree = this.build_child_nodes(tree, nodes);
        }
        tree += '</ul>'
        this.$element.append($(tree));
        $lis = this.$element.find('li');
        len = $lis.length;
        for (i = 0; i < len; i++) {
            $li = $lis.eq(i);
            rec = $li.data('rec');
            clone.rec_no = rec;
            this.item._cur_row = rec;
            $li.data("record", clone._dataset[rec]);
            this.links[clone.rec_no] = $li.get(0);
            if (this.options.node_callback) {
                this.options.node_callback($li, this.item);
            }
        }
        this.select_node($lis.eq(0));

        this.$element.off('mousedown', 'li.parent > div span.tree-bullet');
        this.$element.on('mousedown', 'li.parent > div span.tree-bullet', function(e) {
            var $span = $(this),
                $li = $span.parent().parent(),
                $ul;
            self.toggle_expanded($li);
            e.preventDefault();
            e.stopPropagation();
        });
        this.$element.off('mousedown', 'li > div span.tree-text');
        this.$element.on('mousedown', 'li > div span.tree-text', function(e) {
            var $li = $(this).parent().parent();
            self.select_node($li);
        });
    }

    toggle_expanded($li) {
        var $span = $li.find('div:first span.tree-bullet'),
            $ul;
        if ($li.hasClass('parent')) {
            $ul = $li.find('ul:first'),
                $li.toggleClass('collapsed');
            if ($li.hasClass('collapsed')) {
                $span.html('<i class="bi bi-chevron-right"></i>');
            } else {
                $span.html('<i class="bi bi-chevron-down"></i>');
            }
            $ul.slideToggle(0);
        }
    }

    expand($li) {
        if ($li.hasClass('parent') && $li.hasClass('collapsed')) {
            this.toggle_expanded($li);
        }
        $li = $li.parent().parent()
        if ($li.prop("tagName") === "LI") {
            this.expand($li);
        }
    }

    collapse($li) {
        if ($li.hasClass('parent') && !$li.hasClass('collapsed')) {
            this.toggle_expanded($li);
        }
    }

    select_node($li, update_node) {
        var self = this,
            $parent,
            rec;
        if (update_node === undefined) {
            update_node = true;
        }
        if (this.selected_node) {
            this.selected_node.removeClass('selected selected-focused');
        }
        if ($li && (!this.selected_node || $li.get(0) !== this.selected_node.get(0))) {
            this.selected_node = $li;
            rec = this.item._dataset.indexOf($li.data("record"));
            if (rec !== this.item.rec_no) {
                this.item.rec_no = rec;
            }
            $parent = this.selected_node.parent().parent()
            if ($parent.prop("tagName") === "LI") {
                this.expand($parent);
            }
        }
        if (this.is_focused()) {
            this.selected_node.addClass('selected-focused');
        } else {
            this.selected_node.addClass('selected');
        }
        if (update_node) {
            this.update_selected_node(this.selected_node);
        }
    }

    update_selected_node($li) {
        var containerTop,
            containerBottom,
            elemTop,
            elemBottom,
            parent;
        if ($li.length) {
            containerTop = this.$element.scrollTop();
            containerBottom = containerTop + this.$element.height();
            elemTop = $li.get(0).offsetTop;
            elemBottom = elemTop + $li.height();
            if (elemTop < containerTop) {
                this.$element.scrollTop(elemTop);
            } else if (elemBottom > containerBottom) {
                this.$element.scrollTop(elemBottom - this.$element.height());
            }
        }
    }

    update_field() {
    }

    syncronize() {
        var info,
            li;
        if (this.item.record_count()) {
            try {
                li = this.links[this.item.rec_no]
                if (li) {
                    this.select_node($(li));
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    changed() {}
}


export default DBTree
