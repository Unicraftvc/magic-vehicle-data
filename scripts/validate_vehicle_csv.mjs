import fs from "node:fs";

const file = process.argv[2] || "data/autoevolution_vehicle_updates.csv";
const text = fs.readFileSync(file, "utf8");

function parseCSV(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) throw new Error("Malformed CSV: unclosed quoted field");
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value !== ""));
}

const rows = parseCSV(text);
if (rows.length < 2) throw new Error("CSV must contain a header and at least one record");

const header = rows[0];
const required = [
  "brand", "modelName", "sourceModelName", "category", "yearStart", "yearEnd",
  "isInProduction", "productionYears", "sourceUrl", "externalId"
];
for (const name of required) {
  if (!header.includes(name)) throw new Error(`Missing required column: ${name}`);
}

const index = Object.fromEntries(header.map((name, i) => [name, i]));
const seen = new Set();
const errors = [];

for (let rowNumber = 2; rowNumber <= rows.length; rowNumber += 1) {
  const row = rows[rowNumber - 1];
  if (row.length !== header.length) {
    errors.push(`row ${rowNumber}: expected ${header.length} columns, got ${row.length}`);
    continue;
  }

  const get = (name) => row[index[name]].trim();
  const label = `${get("brand")} ${get("modelName")}`.trim() || `row ${rowNumber}`;
  const category = get("category");
  const sourceUrl = get("sourceUrl");
  const externalId = get("externalId");
  const yearStart = get("yearStart");
  const yearEnd = get("yearEnd");
  const isInProduction = get("isInProduction").toLowerCase();

  if (!["car", "motorbike"].includes(category)) {
    errors.push(`${label}: category must be car or motorbike`);
  }

  const expectedPath = category === "car" ? "/cars/" : "/moto/";
  const expectedIdPrefix = category === "car" ? "autoevolution:car:" : "autoevolution:moto:";
  if (category && !sourceUrl.includes(expectedPath)) {
    errors.push(`${label}: category does not match sourceUrl`);
  }
  if (!externalId) {
    errors.push(`${label}: externalId is required`);
  } else {
    if (seen.has(externalId)) errors.push(`${label}: duplicate externalId ${externalId}`);
    seen.add(externalId);
    if (category && !externalId.startsWith(expectedIdPrefix)) {
      errors.push(`${label}: externalId prefix does not match category`);
    }
  }

  if (!/^\d{4}$/.test(yearStart)) {
    errors.push(`${label}: yearStart must be a four-digit year`);
  }
  if (yearEnd) {
    if (!/^\d{4}$/.test(yearEnd)) {
      errors.push(`${label}: yearEnd must be blank or a four-digit year`);
    } else if (yearEnd === yearStart) {
      errors.push(`${label}: yearEnd equals yearStart; a single source year is a start year, not proof of an end year`);
    } else if (Number(yearEnd) < Number(yearStart)) {
      errors.push(`${label}: yearEnd precedes yearStart`);
    }
  }
  if (isInProduction === "true" && yearEnd) {
    errors.push(`${label}: an in-production record cannot have yearEnd`);
  }
  if (isInProduction && !["true", "false"].includes(isInProduction)) {
    errors.push(`${label}: isInProduction must be true, false, or blank`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${rows.length - 1} vehicle rows with ${seen.size} unique external IDs.`);
