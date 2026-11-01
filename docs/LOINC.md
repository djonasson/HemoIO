# LOINC

[LOINC](https://loinc.org) is the international code system for laboratory
tests. HemoIO gives each test in its biomarker dictionary a LOINC code and
shows LOINC's long common name beside it (`src/data/biomarkers/loinc.ts`).

The LOINC release itself is not in this repository. It is about 1 GB
unzipped and is only needed when working on the dictionary's LOINC data.
`npm run loinc:download` fetches it.

## Account

Downloading LOINC needs a free loinc.org account:

1. Create one at <https://loinc.org> (Sign up).
2. Accept the LOINC license when asked.

The script uses the account's username and password with the
[LOINC Download API](https://loinc.regenstrief.org/api/v1).

## Downloading

```bash
LOINC_USER=you@example.com npm run loinc:download
```

The script:

1. Asks the LOINC API for the current release (version, release date, MD5).
2. Compares it with the latest release already downloaded.
3. Stops with "Up to date; nothing to download." when there is nothing newer.
4. Otherwise downloads the release, checks it against the MD5 and unzips it.
   A download that fails the check is thrown away.

The password is read from `LOINC_PASSWORD` when set, or asked for without
being shown. It goes to curl on its standard input, so it never appears in
the process list or in shell history. Don't put it on the command line.

### Options

| Option / variable | Meaning                                                      |
|-------------------|--------------------------------------------------------------|
| `--force`         | Download the current release again, even if already present |
| `[output-dir]`    | Where releases go (default `~/loinc`)                       |
| `LOINC_DIR`       | Same as `output-dir`, when no argument is given             |
| `LOINC_PASSWORD`  | The password, instead of being asked for it                 |

Pass options after `--`:

```bash
LOINC_USER=you@example.com npm run loinc:download -- --force ~/data/loinc
```

## Layout

Each release goes in its own folder named after its version:

```text
~/loinc/
└── 2.83/
    ├── metadata.json    the API's description of the release
    ├── Loinc_2.83.zip   the release, as downloaded
    └── files/           the release, unzipped
        ├── LoincTable/        Loinc.csv: every code with its parts and names
        ├── LoincTableCore/    the main columns only
        ├── AccessoryFiles/    groups, linguistic variants, parts, top 2000, ...
        ├── LoincLicense_*.txt
        └── LoincReadMe.txt
```

A release counts as downloaded once `metadata.json` is written, which
happens last, and its zip still matches the MD5. An interrupted download is
therefore fetched again on the next run.

## Updating the app to a new release

When a new release is downloaded:

1. Check that the dictionary's codes are still active and their long common
   names unchanged in `files/LoincTable/Loinc.csv`.
2. Update `LONG_COMMON_NAME` and `LOINC_VERSION` in
   `src/data/biomarkers/loinc.ts`.
3. Update the version in the README's Third-Party Notices.

## License

LOINC is free to use under the
[LOINC license](https://loinc.org/license) (`LoincLicense_*.txt` in each
release). It asks that:

- the LOINC notice is shown wherever LOINC content is used. HemoIO shows it
  under Settings → About and in the README;
- each code is shown with one of LOINC's names for it;
- the content of LOINC's fields is not changed.

The release files are kept out of the repository; only the codes and names
the dictionary uses are copied into the app.
