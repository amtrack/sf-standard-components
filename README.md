# sf-standard-components

> The standard objects and fields of Salesforce, with the objects their lookups reference as SfProject

## Generate

```sh
npm install
sf org create scratch --definition-file config/project-scratch-def.json --duration-days 1 --alias standard
node generate.ts --target-org standard
```

It lists the org's objects with `describeGlobal`, describes every non-custom one in composite batches of 25 (one API call each) and writes an SFDX project: `sfdx-project.json` and `force-app/main/default/objects/<Object>/` with a `CustomObject` file and a `CustomField` file per standard field, lookups listing their targets as `<referenceTo>`. `node generate.ts --help` lists the options.

## Gaps

The project holds what one scratch org's admin can describe:

- Fields the admin cannot see are missing, e.g. `Contact.DoNotCall`, `Case.BusinessHoursId`, `Task.Type`.
- Objects and fields of features enabled by settings rather than the features list are missing, e.g. `Network` (Experience Cloud) or `Contact.Pronouns`.
- A feature the Dev Hub has no license for has to be removed from the definition.

## Credits

The idea of describing every standard object in a scratch org with as many features as possible, and the scratch org definition, come from [apex-dev-tools/sobject-types](https://github.com/apex-dev-tools/sobject-types): `config/project-scratch-def.json` is its [`config/org-all.json`](https://github.com/apex-dev-tools/sobject-types/blob/519e1950f13363adf9307f11b4bde8d264cf149d/config/org-all.json) at commit 519e195, under the BSD-3-Clause license in [`config/LICENSE-sobject-types`](config/LICENSE-sobject-types).

## License

MIT, except `config/project-scratch-def.json` (BSD-3-Clause, see above).
