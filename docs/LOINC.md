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

## Prerequisites

- bash 4.3 or newer. macOS ships bash 3.2: install a newer one with
  `brew install bash`.
- `curl`, `unzip` and `python3`.
- `md5sum` (Linux) or `md5` (macOS and the BSDs), to check the download.

The script checks for these first and names any that are missing.

## Downloading

```bash
LOINC_USER=you@example.com npm run loinc:download
```

The script:

1. Asks the LOINC API for the current release (version, release date, MD5).
2. Compares it with the latest release already downloaded.
3. Stops with "Up to date; nothing to download." when there is nothing newer.
4. Otherwise downloads the release, checks it against the MD5 and unzips it.
   A download that fails the check, fails part way or is stopped with
   Ctrl-C is thrown away, together with its version folder if that is
   left empty.

The password is read from `LOINC_PASSWORD` when set, or asked for without
being shown. Without a terminal to ask on (CI, or input from a pipe or a
file) the script stops and says `LOINC_PASSWORD` must be set; a password
piped in is not read. It goes to curl on its standard input, so it never
appears in the process list or in shell history. Don't put it on the
command line.

### Options

| Option / variable | Meaning                                                      |
|-------------------|--------------------------------------------------------------|
| `--force`         | Download the current release again, even if already present |
| `[output-dir]`    | Where releases go (default `~/loinc`)                       |
| `-h`, `--help`    | Show the usage                                               |
| `LOINC_DIR`       | Same as `output-dir`, when no argument is given             |
| `LOINC_PASSWORD`  | The password, instead of being asked for it                 |

Options can come in any order; at most one output dir can be given. A
relative output dir is taken from the folder the command is run in (npm
runs the script from the repository root but passes on where it was
called from; run directly, as `scripts/loinc-download.sh`, the current
folder is used). A `loinc/` folder at the repository root is git-ignored, in
case releases are put there.

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

A release counts as downloaded only when its folder holds `metadata.json`
naming the folder's own version, the zip still matches the MD5 and
`files/` is there. `metadata.json` is written last, and an existing one is
removed before a new download replaces the zip and unzips it, so a folder
left part way (a failed or stopped download or unzip, even with `--force`)
does not count and is fetched again on the next run. Copies under other
names, such as `current/`, are ignored.

## Updating the app to a new release

When a new release is downloaded:

1. Regenerate the catalog (below). The LOINC names the app shows and the
   version in Settings → About come from it.
2. Check that the add-on table's codes are still in it: the
   `src/data/loinc/addons.test.ts` tests fail for a code that is gone.
3. In `src/data/biomarkers/loinc.test.ts`, update the expected names in
   `TERMS` if LOINC renamed a test.
4. Update the version in the README's Third-Party Notices.

## Generating the app's catalog

The app's catalog of laboratory codes is generated from the release files;
it is committed, so building the app never needs the release:

1. Download the release: `npm run loinc:download` (see above).
2. Generate the catalog: `npm run loinc:catalog`. It reads the latest complete
   release under `~/loinc` (or `LOINC_DIR`) and writes
   `src/data/loinc/catalog.generated.json`: the active laboratory codes with a
   common-test rank, with their names (English and Italian), example UCUM
   units and groups. Codes the add-on table (`src/data/loinc/addons.ts`)
   describes, or that reports need, but LOINC does not rank are kept too:
   list them in `EXTRA_CODES` in the script (they get rank 0). Use `--from <files dir>`
   and `--out <path>` to override.

   Rank 0 means unranked: LOINC gives no rank, or one of 0 or less. The app
   treats an unranked test as the least common one, so it sorts after every
   ranked test and never wins a "more common" tie-break against one.

   Of the Italian linguistic variant only the component is kept: its
   RELATEDNAMES2 is a sentence of property and system words, not a list.
3. Commit the regenerated file.

The output is deterministic, so an unchanged release gives an unchanged file.
Tests for the generator run on a small fixture in `scripts/__fixtures__/loinc/`.

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
