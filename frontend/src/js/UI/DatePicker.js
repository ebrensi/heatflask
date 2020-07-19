/**
  * Datepickers in the Dom
  * @module UI/DatePicker
  */

import { set } from Dom;
import Pikaday from 'pikaday';
import "../../node_modules/pikaday/css/pikaday.css";


/** Put date-pickers in DOM */
function makeDatePicker(selector) {
    const el = Dom.el(selector),
          picker = new Pikaday({
        field: el,
        onSelect: function(date) {
            el.value = date.toISOString().split('T')[0];
            set(".preset", "");
        },
        yearRange: [2000, 2022],
        theme: "dark-theme"

    });
    return picker;
}

export const date1picker = makeDatePicker('#date1'),
export const date2picker = makeDatePicker('#date2');

