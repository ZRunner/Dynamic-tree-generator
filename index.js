//@ts-check

const inputdata = [
    { id: 1, MD: true, BP: true, MCC: false, MPG: false, class: true },
    { id: 2, MD: false, BP: false, MCC: true, MPG: true, class: true },
    { id: 3, MD: true, BP: true, MCC: true, MPG: false, class: true },
    { id: 4, MD: true, BP: true, MCC: false, MPG: true, class: true },
    { id: 5, MD: false, BP: true, MCC: true, MPG: true, class: false },
    { id: 6, MD: false, BP: false, MCC: true, MPG: false, class: false },
    { id: 7, MD: true, BP: false, MCC: false, MPG: false, class: false },
    { id: 8, MD: true, BP: false, MCC: true, MPG: false, class: false },
    // { id: 9, MD: false, BP: false, MCC: true, MPG: false, class: true },
];
const column_names = {
    MD: 'Match à domicile',
    BP: 'Balance positive',
    MCC: 'Mauvaises conditions climatiques',
    MPG: 'Match précédemment gagné',
    class: 'Match gagné'
}
const columns_table_data = []
var inputtable;
var columnstable;

const boolean_column = { formatter: "tickCross", editor: "tickCross", hozAlign: "center", headerHozAlign: "center", editable: true }
const string_column = { hozAlign: "center", headerHozAlign: "center", editor:"input", editable: true }

// create the tree
// create an array with nodes
// @ts-ignore
var nodes = new vis.DataSet();

// create an array with edges
// @ts-ignore
var edges = new vis.DataSet();

class TreeNode {
    /**
     * 
     * @param {String} attr_name
     * @param {Object.<string, any>} data 
     */
    constructor(attr_name, data) {
        /** @type {string} */ this.attr_name = attr_name;
        /** @type {Object.<string, any>} */ data = data || {};
        /** @type {TreeNode} */ this.parent = (data.parent instanceof TreeNode) ? data.parent : null;
        /** @type {number} */ this.gain = (typeof data.gain === 'number') ? data.gain : 0;
        /** @type {boolean} */ this.final = (typeof data.final === 'boolean') ? data.final : false;
        /** @type {number} */ this.node_id = (typeof data.node_id === 'number') ? Math.round(data.node_id) : 0;
        /** @type {number} */ this.level = (typeof data.level === 'number') ? Math.round(data.level) : 0;
        /** @type {Map.<string, any>[]} */ this.group = (data.group instanceof Array) ? data.group : null;
    }

    get shape() {
        return this.final ? 'ellipse' : 'box';
    }
}

/**
 * Calculate the proportion of each value inside a list of elements
 * @param {Map.<string, any>[]} E The elements group to analyze
 * @param {String} attr_name The name of the attribute to consider
 * @returns {Map<String, Number>} proportions by value
 */
function calcul_p(E, attr_name) {
    let cardE = E.length
    let cardP = new Map()
    // for each line
    E.forEach(e => {
        let value = e.get(attr_name)
        if (value === undefined) return
        if (cardP.has(value)) cardP.set(value, cardP.get(value)+1)
        else cardP.set(value, 1)
    })
    // divide by the group cardinal
    cardP.forEach((v, k) => {
        cardP.set(k, v/cardE)
    })
    return cardP
}

/**
 * Calculate a group entropy from their classes proportions
 * @param {Map<String, Number>} cardP Proportions table by class
 * @returns {Number} The group entropy
 */
function Entropie(cardP) {
    let result = 0
    cardP.forEach(value => {
        result -= value * Math.log2(value)
    })
    return result
}

/**
 * Create a subgroup from a group matching a predicate
 * @param {(Object.<string, any>[]|Map.<string, any>[])} E The original group
 * @param {Function} predicate The predicate used to filter elements
 * @returns {Map.<string, any>[]} The extracted subgroup
 */
function create_sub(E, predicate) {
    let result = []
    E.forEach(e => {
        if (predicate(e)) {
            const elem = (e instanceof Map) ? new Map(e) : new Map(Object.entries(e))
            result.push(elem)
        }
    })
    return result
}

/**
 * Create a new group by deleting a specific column
 * @param {(Object.<string, any>[]|Map.<string, any>[])} E The original group
 * @param {String} attr_name The column to delete
 * @returns {Map.<string, any>[]} The newly created group
 */
function delete_column(E, attr_name) {
    let result = []
    E.forEach(e => {
        const elem = (e instanceof Map) ? new Map(e) : new Map(Object.entries(e))
        elem.delete(attr_name)
        result.push(elem);
    })
    return result
}

/**
 * Get the different values taken by a specific attribute
 * @param {Map.<string, any>[]} E The group to analyze
 * @param {String} attr_name The attribute to analyze
 * @returns {Set.<String>} The list of values
 */
function get_values(E, attr_name) {
    const result = new Set()
    E.forEach(e => {
        result.add(e.get(attr_name))
    })
    return result
}

/**
 * Round a number to some digits
 * @param {Number} number number to round
 * @param {Number} precision number of digits after the decimal point
 * @returns The rounded number
 */
function round(number, precision) {
    const p = Math.pow(10, precision)
    return Math.round(number*p)/p
}

/**
 * Get the attribute providing the best benefits to the decisions tree
 * @param {Map.<string, any>[]} E The group to analyze
 * @returns {TreeNode} The detected best attribute
 */
function get_best_attr(E) {
    const D_proportions = calcul_p(E, 'class');
    const D_entropy = Entropie(D_proportions);
    console.debug("E_proportions:", D_proportions, " E_entropy:", D_entropy);
    
    // pure node
    if (D_entropy == 0) {
        const keysSet = Array.from(D_proportions.keys());
        const result = keysSet.length ? ""+keysSet[0] : '?';
        return new TreeNode(result, { gain: D_entropy, final: true, group: E });
    }

    let winning_attr = new TreeNode(null, {})

    const attributes = new Set(E[0].keys())
    // console.debug('attributes', attributes)

    attributes.forEach(attr => {
        if (attr == 'id' || attr == 'class') return;
        const attr_proportions = calcul_p(E, attr);
        
        const attr_values = new Set(attr_proportions.keys());
        let gain = D_entropy;
        attr_values.forEach(value => {
            const sub_group = create_sub(E, (/** @type {Map.<string, any>} */ e) => e.get(attr) == value);
            console.debug(`Sub where ${attr}=${value}`, sub_group);
            console.debug(`Proportion for ${attr}=${value}`, calcul_p(sub_group, 'class'), "  coef:", attr_proportions.get(value), "  entropy:", Entropie(calcul_p(sub_group, 'class')))
            gain -= attr_proportions.get(value) * Entropie(calcul_p(sub_group, 'class'));
        })
        
        console.debug(attr, "  proportions:", attr_proportions, "  gain:", round(gain, 3), " E:", E);
        // if the current attribute is better than the precedents
        if (gain > winning_attr.gain) {
            winning_attr = new TreeNode(attr, { gain: gain, final: false, group: E });
            console.debug("new gain detected");
        }
        console.debug()
    })

    // if no attr can be useful here
    if (winning_attr.attr_name == null) {
        let name = "";
        D_proportions.forEach((proportion, value) => {
            name += `${value}: ${round(proportion, 3)} | `
        })
        winning_attr = new TreeNode(name.slice(0, name.length - 3), {final: true, group: E})
    }

    return winning_attr;
}

/**
 * Get all children of a specific node
 * @param {TreeNode} nodes_info The root node info
 * @return {Map<any,TreeNode>} The children info
 */
function get_tree_children(nodes_info) {
    const result = new Map();
    get_values(nodes_info.group, nodes_info.attr_name).forEach(possible_value => {
        let new_E = create_sub(nodes_info.group, (/** @type {Map.<string, any>} */ e) => e.get(nodes_info.attr_name) == possible_value);
        new_E = delete_column(new_E, nodes_info.attr_name);
        console.debug(`new E when ${nodes_info.attr_name}=${possible_value}:`, new_E);

        const second_best_attr = get_best_attr(new_E);
        second_best_attr.parent = nodes_info;
        second_best_attr.level = nodes_info.level+1;
        result.set(possible_value, second_best_attr)

        console.info(`best attr when ${nodes_info.attr_name}=${possible_value}: `, second_best_attr);
        console.debug()

        // draw the node and link it
        const node_tooltip = new_E.length + (new_E.length == 1 ? " element" : " elements");
        nodes.add({id: nodes.length, label: column_names[second_best_attr.attr_name] ?? second_best_attr.attr_name, level: second_best_attr.level, shape: second_best_attr.shape, title: node_tooltip})
        second_best_attr.node_id = nodes.length-1;
        edges.add({from: nodes_info.node_id, to: second_best_attr.node_id, label: `${possible_value}`, title: "gain: "+round(second_best_attr.gain, 3)})
    })
    return result;
}

/**
 * Draw the decision tree from the 'inputdata' table
 */
function draw_tree() {
    // reset the graph
    nodes.clear();
    edges.clear();

    // create the main element
    const E = create_sub(inputdata, () => true)

    // get the tree root
    let best_root_attr = get_best_attr(E);
    console.info("root best attr:", best_root_attr);
    best_root_attr.node_id = 0;
    best_root_attr.level = 0;
    const node_tooltip = E.length + (E.length == 1 ? " element" : " elements");
    nodes.add({id: best_root_attr.node_id, label: column_names[best_root_attr.attr_name] ?? best_root_attr.attr_name, level: best_root_attr.level, shape: best_root_attr.shape, title: node_tooltip})

    let unfinished = best_root_attr.final ? [] : [best_root_attr]
    while (unfinished.length) {
        unfinished.forEach((node, i) => {
            console.debug("--- new iteration ---")
            const children = get_tree_children(node);
            children.forEach((node, value) => {
                if (!node.final && node.level < 6) {
                    console.info("adding node for analyzing", node);
                    unfinished.push(node)
                }
            })
            unfinished.splice(i, 1);
            console.debug("still", unfinished.length, "to go")
        })
    }
}

/**
 * Delete a row from both the table and the data array
 * @param {{ _row: { data: { id: number; }; }; delete: () => void; }} row
 */
function delete_row(row) {
    const i = inputdata.findIndex(node => node.id === row._row.data.id);
    if (i == -1) {
        // if row exists in the table but not in inputdata
        row.delete();
        return;
    };
    inputdata.splice(i, 1);
}

/**
 * Update the columns used by the data table
 */
function update_inputtable_columns() {
    // create the table columns definitions
    let columns_def = Array.from(Object.entries(inputdata[0]), row => {
        return Object.assign({
            title: column_names[row[0]],
            field: row[0],
        }, (typeof row[1] == 'boolean') ? boolean_column : string_column)
    }).slice(1);
    // @ts-ignore
    columns_def.unshift({formatter:"rowSelection", titleFormatter:"rowSelection", headerHozAlign: "center", hozAlign:"center", headerSort:false, width:30, cellClick:function(_e, cell){
        cell.getRow().toggleSelect();
    }})
    // @ts-ignore
    columns_def.unshift({rowHandle:true, formatter:"handle", headerSort:false, frozen:true, width:30, minWidth:30});

    inputtable?.setColumns(columns_def)
}

/**
 * Init the columns definitions table
 */
function init_columnstable() {
    while (columns_table_data.length) { columns_table_data.pop() };
    
    let i = 0;
    Object.entries(inputdata[0]).forEach(attr => {
        if (attr[0] == 'id') return;
        columns_table_data.push({
            id: i++,
            name: attr[0],
            tag: column_names[attr[0]] ?? attr[0],
            type: typeof attr[1],
        })
    })
    
    // @ts-ignore
    columnstable = new Tabulator("#columns-table", {
        data: columns_table_data,
        reactiveData: true,
        maxHeight: 160,
        selectable: true,
        layout:"fitDataTable",
        columns: [
            {formatter:"rowSelection", titleFormatter:"rowSelection", headerHozAlign: "center", hozAlign:"center", headerSort:false, width:30, cellClick:function(_e, cell){
                cell.getRow().toggleSelect();
            }},
            {title:"ID", field:"name", editor:"input", minWidth: 70},
            {title:"Display name", field:"tag", editor:"input"},
            {title:"Type", field:"type", minWidth:90, editor:"select", editorParams:{values:["boolean", "string"]}},
        ],
        dataChanged: () => {
            console.debug("DATA CHANGED");
            const new_names = Array.from(columns_table_data, column => column.name);
            const attributes = Array.from(Object.keys(inputdata[0]))
            
            columns_table_data.forEach(column => {
                column_names[column.name] = column.tag;

                if (!attributes.includes(column.name)) {
                    // a column ID changed
                    const old_name = attributes.find(name => name != 'id' && !new_names.includes(name))
                    if (old_name == 'class') {
                        column.name = old_name;
                        return;
                    }
                    inputdata.forEach(row => {
                        row[column.name] = row[old_name];
                        delete row[old_name]
                    })
                    console.debug("old_name:", old_name, "new_name:", column.name)
                }

                if (typeof inputdata[0][column.name] != column.type) {
                    inputdata.forEach(row => {
                        const old_value = row[column.name];
                        row[column.name] = column.type == 'boolean' ? (old_value=='true') : old_value+"";
                    })
                }
            })

            // check for any duplicated "names" (or data IDs)
            if (new_names.length !== new Set(new_names).size) {
                alert("You have duplicated column names! Make sure to fix it before editing data")
            }
            // check for any deleted column
            update_columnstable();

            update_inputtable_columns();
        },
    })
}

/**
 * 
 * @returns {boolean} if a column has indeed been deleted
 */
function update_columnstable() {
    const new_names = Array.from(columns_table_data, column => column.name);
    new_names.push('id');
    const attributes = Array.from(Object.keys(inputdata[0]))

    if (attributes.length !== new_names.length) {
        const deleted_rows = attributes.filter(attr => !new_names.includes(attr));
        console.debug("deleted rows", deleted_rows, attributes, new_names);
        inputdata.forEach(row => {
            deleted_rows.forEach(attr => {
                delete row[attr];
            });
        });
        return true;
    }
    return false;
}

window.addEventListener('load', () => {

    // add a column definition row
    document.getElementById('columns-addrow').addEventListener('click', () => {
        columns_table_data.push({
            id: columns_table_data[columns_table_data.length-1].id+1,
            name: "",
            tag: "New column",
            type: "string",
        })
    })

    // delete a column definition row
    document.getElementById('columns-delrow').addEventListener('click', () => {
        columnstable.getSelectedRows().forEach(row => {
            const i = columns_table_data.findIndex(column => column.id === row._row.data.id);
            if (i == -1) {
                // if row exists in the table but not in inputdata
                row.delete();
                return;
            };
            columns_table_data.splice(i, 1);
        })
        if (update_columnstable()) {
            update_inputtable_columns();
        } 
    })

    // add a rown to the table when asked to
    document.getElementById('table-addrow').addEventListener('click', () => {
        // increment the ID by one
        let id = Math.max(...Array.from(inputdata, r => r.id)) + 1;
        if (id == -Infinity) id = 0;
        let new_elem = {id: id};
        // reset each case according to its type
        columns_table_data.forEach(column => {
            switch (column.type) {
                case 'string':
                    new_elem[column.name] = '';
                    break;
                case 'boolean':
                    new_elem[column.name] = false;
                    break;
                default:
                    new_elem[column.name] = null;
                    console.debug("NOPE");
            }
        })
        // add it to the table
        // @ts-ignore
        inputdata.push(new_elem);
    })

    // delete every selected row
    document.getElementById('table-delrow').addEventListener('click', () => {
        inputtable.getSelectedRows().forEach((/** @type {{ _row: { data: { id: number; }; }; delete: () => void; }} */ row) => {
            delete_row(row);
        });
    })

    // delete every row
    document.getElementById('table-clear').addEventListener('click', () => {
        while (inputdata.length > 0) {
            inputdata.pop();
        }
    })

    // download the table data as a CSV file
    document.getElementById("table-download").addEventListener("click", () => {
        inputtable.download("csv", "data.csv");
    });

    

    // create the columns definition table
    init_columnstable();

    // create Tabulator on DOM element with id "input-table"
    // @ts-ignore
    inputtable = new Tabulator("#input-table", {
        data: inputdata,
        reactiveData:true,
        maxHeight: 450,
        layout: "fitColumns",
        history: true,
        movableColumns: true,
        movableRows:true,
        selectable:true,
    })

    update_inputtable_columns();
    inputtable.setSort("class", "desc");

    // create a network
    var container = document.getElementById('final-tree');

    // provide the data in the vis format
    var data = {
        nodes: nodes,
        edges: edges
    };
    var options = {
        autoResize: true,
        height: '100%',
        width: '100%',
        interaction: {hover: true, zoomView: true},
        layout: {hierarchical: true}
    };

    // initialize the network
    // @ts-ignore
    var network = new vis.Network(container, data, options);

    // calculate and draw the tree
    draw_tree();
});

