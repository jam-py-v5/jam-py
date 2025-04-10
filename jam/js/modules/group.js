import consts from "./consts.js";
import AbsrtactItem from "./abstr_item.js";
import Item from "./item.js";
import Report from "./report.js";

class Group extends AbsrtactItem {
    constructor(owner, ID, item_name, caption, visible, type, js_filename) {
        super(owner, ID, item_name, caption, visible, type, js_filename);
    }

    getChildClass() {
        if (this.item_type === "reports") {
            return Report;
        } else {
            return Item;
        }
    }
}

export default Group
