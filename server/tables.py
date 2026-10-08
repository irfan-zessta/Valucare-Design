"""Read CSV / XLSX uploads into rows; write CSV exports. Standard library only."""
import csv
import io
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _xlsx_rows(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    sheet = next((n for n in sorted(z.namelist()) if n.startswith("xl/worksheets/sheet")), None)
    if not sheet:
        raise ValueError("The workbook has no worksheet.")
    root = ET.fromstring(z.read(sheet))
    rows = []
    for row in root.iter("{%s}row" % NS["m"]):
        vals = {}
        for c in row.findall("m:c", NS):
            t = c.get("t")
            v = c.find("m:v", NS)
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
            else:
                val = v.text if v is not None else ""
                if val and re.fullmatch(r"-?\d+\.0", val):
                    val = val[:-2]
            vals[_col_index(c.get("r"))] = val
        if vals:
            width = max(vals) + 1
            rows.append([vals.get(i, "") for i in range(width)])
    return rows


def parse_table(filename, data):
    """Return (headers, list_of_dict_rows). Raises ValueError with a readable message."""
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        try:
            raw = _xlsx_rows(data)
        except zipfile.BadZipFile:
            raise ValueError("This .xlsx file could not be opened. Save it again from Excel or upload a CSV.")
    elif name.endswith(".csv") or name.endswith(".txt"):
        text = data.decode("utf-8-sig", errors="replace")
        raw = list(csv.reader(io.StringIO(text)))
    elif name.endswith(".xls"):
        raise ValueError("Legacy .xls files are not supported. Save as .xlsx or CSV and upload again.")
    else:
        raise ValueError("Upload a CSV or Excel (.xlsx) file.")
    raw = [r for r in raw if any(str(c).strip() for c in r)]
    if not raw:
        raise ValueError("The file is empty.")
    headers = [str(h).strip() for h in raw[0]]
    rows = []
    for r in raw[1:]:
        rows.append({headers[i]: (str(r[i]).strip() if i < len(r) else "") for i in range(len(headers)) if headers[i]})
    return headers, rows


def norm_header(h):
    return re.sub(r"[^a-z0-9]", "", (h or "").lower())


def to_csv(headers, rows):
    """rows: list of dicts or lists. Excel-friendly UTF-8 with BOM."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    for r in rows:
        if isinstance(r, dict):
            w.writerow(["" if r.get(h) is None else r.get(h) for h in headers])
        else:
            w.writerow(r)
    return ("﻿" + buf.getvalue()).encode("utf-8")
