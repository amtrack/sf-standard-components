import assert from "node:assert/strict";
import { test } from "node:test";
import { projectFiles } from "./generate.ts";

test("writes each object with its standard fields, lookups with their sorted targets", () => {
  const field = (name: string, referenceTo: string[] = [], custom = false) => ({
    name,
    custom,
    referenceTo,
  });
  const files = new Map(
    projectFiles(
      [
        {
          name: "Task",
          custom: false,
          fields: [
            field("Subject"),
            field("WhatId", ["Opportunity", "Account"]),
            field("Foo__c", [], true),
          ],
        },
      ],
      "66.0",
    ),
  );
  const dir = "force-app/main/default/objects/Task";
  assert.deepEqual(
    [...files.keys()],
    [
      "sfdx-project.json",
      `${dir}/Task.object-meta.xml`,
      `${dir}/fields/Subject.field-meta.xml`,
      `${dir}/fields/WhatId.field-meta.xml`,
    ],
  );
  assert.match(files.get("sfdx-project.json")!, /"sourceApiVersion": "66.0"/);
  assert.doesNotMatch(files.get(`${dir}/fields/Subject.field-meta.xml`)!, /referenceTo|<type>/);
  assert.match(
    files.get(`${dir}/fields/WhatId.field-meta.xml`)!,
    /<fullName>WhatId<\/fullName>\n {4}<referenceTo>Account<\/referenceTo>\n {4}<referenceTo>Opportunity<\/referenceTo>\n {4}<type>Lookup<\/type>/,
  );
});
