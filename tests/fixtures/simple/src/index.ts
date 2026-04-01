import { addNumbers, greet } from "./used.js";
import { helpers } from "./barrel.js";

function main() {
  console.log(greet("world"));
  console.log(addNumbers(1, 2));
  console.log(helpers.pluralize("item", 3));
}

main();
