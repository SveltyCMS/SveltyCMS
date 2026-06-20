/*
 * @description: Fixes e2e locators.
 * @why: Because Playwright is flakey with getByRole.
 */
import fs from "fs";
import path from "path";

function walk(dir, callback) {
  fs.readdirSync(dir).forEach((f) => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walk(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

walk("tests/e2e", function (filePath) {
  if (filePath.endsWith(".ts")) {
    let content = fs.readFileSync(filePath, "utf8");

    let newContent = content.replace(
      /getByRole\("button",\s*\{?\s*name:\s*\/save\/i\s*\}?\)\.click\(\)/g,
      'getByRole("button", { name: /save/i }).first().click()',
    );

    // Convert getByRole("heading", { name: ... }) to include level: 1 if it doesn't already have it
    // and doesn't already end in .first()
    newContent = newContent.replace(
      /getByRole\("heading",\s*\{\s*name:\s*(\/[^/]+\/i?)\s*\}\)(?!\.first\(\))/g,
      'getByRole("heading", { level: 1, name: $1 })',
    );
    newContent = newContent.replace(
      /getByRole\("heading",\s*\{\s*name:\s*("[^"]+")\s*\}\)(?!\.first\(\))/g,
      'getByRole("heading", { level: 1, name: $1 })',
    );

    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent);
      console.log("Updated", filePath);
    }
  }
});
