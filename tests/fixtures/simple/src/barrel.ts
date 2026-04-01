// A tiny barrel module to exercise re-export handling.
import * as _helpers from "./helpers.js";

export const helpers = {
  pluralize: _helpers.pluralize,
};
