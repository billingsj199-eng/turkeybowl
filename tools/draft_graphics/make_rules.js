// Turkey Bowl rulebook graphic (Instagram 1080x1350 PNG). Reads RULES from the site's rules.js, so the graphic
// always matches the Rules page. Edit the rules in rules.js, then re-run.
//
//   node tools/draft_graphics/make_rules.js        (run from E:\TurkeyBowl)
//
// Output: tools/graphics/rules/rulebook-<season>.png
const fs = require("fs"), path = require("path"), vm = require("vm"), { render, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "rules");

const ctx = { document: { getElementById: () => null } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(TB, "rules.js"), "utf8") + "\nthis.X = {RULES, RULES_SEASON};", ctx);
const { RULES, RULES_SEASON } = ctx.X;
const name = `rulebook-${RULES_SEASON}`;
render("rules_template.html", { season: RULES_SEASON, groups: RULES }, [name], PNG);
console.log("rules graphic: " + path.relative(TB, path.join(PNG, name + ".png")));
