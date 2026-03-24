import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md"]);
const SUSPICIOUS_PATTERN =
  /(Ã.|Å.|Ä.|â€™|â€œ|â€\u009d|â€"|â€¢|â€¦|ðŸ|ğŸ|Â©|Â®|Â°|�)/g;

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(resolved, files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(resolved);
    }
  }
  return files;
}

const offenders = [];

for (const file of walk(ROOT)) {
  const content = fs.readFileSync(file, "utf8");
  SUSPICIOUS_PATTERN.lastIndex = 0;
  const match = SUSPICIOUS_PATTERN.exec(content);
  if (!match) {
    continue;
  }

  const line = content.slice(0, match.index).split(/\r?\n/).length;
  const preview = content.slice(Math.max(0, match.index - 20), Math.min(content.length, match.index + 40)).replace(/\r?\n/g, " ");
  offenders.push({
    file: path.relative(process.cwd(), file),
    line,
    preview
  });
}

if (offenders.length === 0) {
  console.log("Mojibake scan passed.");
  process.exit(0);
}

console.error("Mojibake scan failed. Suspicious sequences found:");
for (const offender of offenders) {
  console.error(`- ${offender.file}:${offender.line} :: ${offender.preview}`);
}
process.exit(1);

