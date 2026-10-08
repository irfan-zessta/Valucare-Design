"""Minimal multi-page PDF writer (Helvetica text, rules, simple tables).

Enough for proposal, SOB client-signature format and COC documents without
third-party libraries.
"""

PAGE_W, PAGE_H = 595, 842  # A4 points
MARGIN = 50


def _esc(s):
    s = str(s).encode("latin-1", "replace").decode("latin-1")
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap(text, size, width):
    # Helvetica average glyph width ~0.5em; conservative wrap.
    max_chars = max(10, int(width / (size * 0.5)))
    out = []
    for para in str(text).split("\n"):
        line = ""
        for word in para.split(" "):
            if len(line) + len(word) + 1 > max_chars and line:
                out.append(line)
                line = word
            else:
                line = f"{line} {word}" if line else word
        out.append(line)
    return out


class Doc:
    def __init__(self, title, footer=""):
        self.pages = []
        self.title = title
        self.footer = footer
        self._new_page()

    def _new_page(self):
        self.ops = []
        self.pages.append(self.ops)
        self.y = PAGE_H - MARGIN

    def _need(self, h):
        if self.y - h < MARGIN + 20:
            self._new_page()

    def text(self, s, size=10, bold=False, indent=0, gap=4):
        width = PAGE_W - 2 * MARGIN - indent
        for line in _wrap(s, size, width):
            self._need(size + gap)
            self.y -= size + gap
            font = "F2" if bold else "F1"
            self.ops.append(f"BT /{font} {size} Tf {MARGIN + indent} {self.y:.1f} Td ({_esc(line)}) Tj ET")

    def heading(self, s, size=14):
        self.space(6)
        self.text(s, size=size, bold=True)
        self.space(2)

    def space(self, h=8):
        self.y -= h

    def rule(self):
        self._need(10)
        self.y -= 6
        self.ops.append(f"0.75 G 0.5 w {MARGIN} {self.y:.1f} m {PAGE_W - MARGIN} {self.y:.1f} l S 0 G")
        self.y -= 4

    def table(self, headers, rows, widths=None, size=8.5):
        avail = PAGE_W - 2 * MARGIN
        widths = widths or [avail / len(headers)] * len(headers)
        scale = avail / sum(widths)
        widths = [w * scale for w in widths]

        def draw_row(cells, bold=False):
            wrapped = [_wrap(c if c is not None else "", size, w - 6) for c, w in zip(cells, widths)]
            lines = max(len(w) for w in wrapped)
            h = lines * (size + 3) + 6
            self._need(h)
            top = self.y
            x = MARGIN
            for col, w in zip(wrapped, widths):
                yy = top - size - 3
                for ln in col:
                    font = "F2" if bold else "F1"
                    self.ops.append(f"BT /{font} {size} Tf {x + 3:.1f} {yy:.1f} Td ({_esc(ln)}) Tj ET")
                    yy -= size + 3
                x += w
            self.y = top - h
            self.ops.append(f"0.85 G 0.4 w {MARGIN} {self.y:.1f} m {PAGE_W - MARGIN} {self.y:.1f} l S 0 G")

        draw_row(headers, bold=True)
        for r in rows:
            draw_row([str(c) for c in r])
        self.space(6)

    def signature_block(self, labels):
        self.space(30)
        for lab in labels:
            self._need(50)
            self.y -= 36
            self.ops.append(f"0 G 0.6 w {MARGIN} {self.y:.1f} m {MARGIN + 220} {self.y:.1f} l S")
            self.y -= 12
            self.ops.append(f"BT /F1 9 Tf {MARGIN} {self.y:.1f} Td ({_esc(lab)}) Tj ET")

    def render(self):
        objs = []

        def add(b):
            objs.append(b)
            return len(objs)

        f1 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        f2 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        pages_id = add(b"")  # placeholder
        page_ids = []
        n = len(self.pages)
        for i, ops in enumerate(self.pages, 1):
            foot = f"BT /F1 8 Tf {MARGIN} 28 Td ({_esc(self.footer)}  -  Page {i} of {n}) Tj ET"
            stream = ("\n".join(ops + [foot])).encode("latin-1", "replace")
            cid = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
            pid = add(("<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>"
                       % (pages_id, PAGE_W, PAGE_H, f1, f2, cid)).encode())
            page_ids.append(pid)
        objs[pages_id - 1] = ("<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join(f"{p} 0 R" for p in page_ids), n)).encode()
        info = add(("<< /Title (%s) /Producer (HMS3 Corporate New Business) >>" % _esc(self.title)).encode("latin-1", "replace"))
        cat = add(("<< /Type /Catalog /Pages %d 0 R >>" % pages_id).encode())
        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for i, b in enumerate(objs, 1):
            offsets.append(len(out))
            out += b"%d 0 obj\n" % i + b + b"\nendobj\n"
        xref = len(out)
        out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
        for o in offsets:
            out += b"%010d 00000 n \n" % o
        out += b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, cat, info, xref)
        return bytes(out)
