#!/usr/bin/env node

// Credit: the idea of describing every standard object in a scratch org with as many features as possible,
// and that scratch org definition (config/project-scratch-def.json), come from apex-dev-tools/sobject-types
// (BSD-3-Clause, see config/LICENSE-sobject-types): https://github.com/apex-dev-tools/sobject-types
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { Org, type Connection } from "@salesforce/core";

type FieldDescribe = {
  name: string;
  custom: boolean;
  referenceTo?: string[] | null;
  relationshipName?: string | null;
};
export type SObjectDescribe = { name: string; custom: boolean; fields: FieldDescribe[] };

const usage = `Describes every standard object of a Salesforce org and writes them as an SFDX project:
sfdx-project.json and force-app/main/default/objects/<Object>/ with a CustomObject file and
a CustomField file per standard field; a lookup lists the objects it references as <referenceTo>.

Usage: node generate.ts [--target-org <alias>] [--output-dir .]

Options:
  -o, --target-org  Describe this org, e.g. a scratch org created from config/project-scratch-def.json.
                    Default: the sf CLI's target-org.
  -d, --output-dir  Default: the current directory.
  -h, --help        Show this help.

Needs Node.js 24.`;

// A composite batch holds at most 25 subrequests and counts as one API call.
const BATCH_SIZE = 25;
const PARALLEL_BATCHES = 5;
const XML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>\n`;
const XMLNS = "http://soap.sforce.com/2006/04/metadata";

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

async function describeBatch(conn: Connection, names: string[]): Promise<SObjectDescribe[]> {
  const { results } = await conn.requestPost<{
    results: Array<{ statusCode: number; result: unknown }>;
  }>("/composite/batch", {
    batchRequests: names.map((name) => ({
      method: "GET",
      url: `v${conn.version}/sobjects/${name}/describe`,
    })),
  });
  return results.flatMap(({ statusCode, result }, i) => {
    if (statusCode === 200) return [result as SObjectDescribe];
    console.error(`Skipped ${names[i]}: HTTP ${statusCode} ${JSON.stringify(result)}`);
    return [];
  });
}

// shortcut: Metadata API allows one referenceTo; a polymorphic lookup gets one element per target.
function fieldXml(field: FieldDescribe): string {
  const targets = (field.referenceTo ?? []).toSorted();
  const body = [
    `    <fullName>${field.name}</fullName>`,
    ...targets.map((target) => `    <referenceTo>${target}</referenceTo>`),
    ...(targets.length > 0 ? ["    <type>Lookup</type>"] : []),
  ];
  return `${XML_HEADER}<CustomField xmlns="${XMLNS}">\n${body.join("\n")}\n</CustomField>\n`;
}

/** The project files as [path, content], for each object and its standard fields. */
export function projectFiles(
  describes: SObjectDescribe[],
  apiVersion: string,
): Array<[string, string]> {
  const project = {
    packageDirectories: [{ path: "force-app", default: true }],
    sourceApiVersion: apiVersion,
  };
  return [
    ["sfdx-project.json", `${JSON.stringify(project, null, 2)}\n`],
    ...describes.flatMap((object): Array<[string, string]> => {
      const dir = `force-app/main/default/objects/${object.name}`;
      return [
        [
          `${dir}/${object.name}.object-meta.xml`,
          `${XML_HEADER}<CustomObject xmlns="${XMLNS}"/>\n`,
        ],
        ...object.fields
          .filter((field) => !field.custom)
          .map((field): [string, string] => [
            `${dir}/fields/${field.name}.field-meta.xml`,
            fieldXml(field),
          ]),
      ];
    }),
  ];
}

// Formula paths name a lookup by its field name without "Id"; list the lookups where that does not hold.
function reportRelationshipNames(describes: SObjectDescribe[]): void {
  const exceptions = describes.flatMap((object) =>
    object.fields
      .filter((field) => field.relationshipName && `${field.relationshipName}Id` !== field.name)
      .map((field) => `${object.name}.${field.name} (${field.relationshipName})`),
  );
  if (exceptions.length > 0)
    console.error(
      `${exceptions.length} relationship names differ from their field name without "Id": ${exceptions.join(", ")}`,
    );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "target-org": { type: "string", short: "o" },
      "output-dir": { type: "string", short: "d", default: "." },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return console.log(usage);
  const targetOrg = values["target-org"];
  const org = targetOrg ? await Org.create({ aliasOrUsername: targetOrg }) : await Org.create({});
  const conn = org.getConnection();
  const { sobjects } = await conn.describeGlobal();
  const names = sobjects.filter((sobject) => !sobject.custom).map((sobject) => sobject.name);
  console.error(`Describing ${names.length} standard objects with API ${conn.version}`);
  const describes: SObjectDescribe[] = [];
  for (const group of chunks(chunks(names, BATCH_SIZE), PARALLEL_BATCHES)) {
    describes.push(...(await Promise.all(group.map((batch) => describeBatch(conn, batch)))).flat());
    console.error(`${describes.length}/${names.length}`);
  }
  reportRelationshipNames(describes);
  const files = projectFiles(describes, conn.version);
  for (const [path, content] of files) {
    const file = join(values["output-dir"], path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  console.log(`${values["output-dir"]}: ${files.length} files from API ${conn.version}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
