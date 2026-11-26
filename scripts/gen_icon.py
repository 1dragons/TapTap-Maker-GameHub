import os
import math
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
os.makedirs(OUT_DIR, exist_ok=True)


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(round(v))))


def dist_seg(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def blend(dst, src_r, src_g, src_b, alpha):
    a = max(0.0, min(1.0, alpha))
    return (
        dst[0] * (1 - a) + src_r * a,
        dst[1] * (1 - a) + src_g * a,
        dst[2] * (1 - a) + src_b * a,
        min(255.0, dst[3] + 255.0 * a * (1 - dst[3] / 255.0)),
    )


def render_rgba(size):
    buf = bytearray(size * size * 4)
    # Supersampled squircle + glowing Git-node GameHub emblem
    s = float(size)
    cx, cy = s * 0.5, s * 0.5
    rad = s * 0.45

    # Node coordinates in normalized [0..1] space (a sleek Y-shaped git branch + glowing nodes)
    n_bot = (0.36 * s, 0.72 * s)
    n_mid = (0.36 * s, 0.48 * s)
    n_top = (0.36 * s, 0.27 * s)
    n_br  = (0.67 * s, 0.32 * s)
    n_br2 = (0.67 * s, 0.58 * s)

    stroke_w = s * 0.048
    node_r = s * 0.088
    inner_r = s * 0.042

    for y in range(size):
        ny = (y + 0.5 - cy) / rad
        for x in range(size):
            nx = (x + 0.5 - cx) / rad
            # Superellipse (squircle) mask
            d_sq = (abs(nx) ** 4.2 + abs(ny) ** 4.2) ** (1.0 / 4.2)
            edge_aa = max(0.0, min(1.0, (1.0 - d_sq) * (s * 0.14)))
            if edge_aa <= 0.0:
                continue

            # Rich deep navy -> indigo -> subtle cyan top-left glow gradient
            gx = x / s
            gy = y / s
            bg_r = 12 + 24 * gx + 20 * (1 - gy)
            bg_g = 17 + 26 * (1 - gy) + 12 * gx
            bg_b = 34 + 58 * (1 - gx * 0.4) + 32 * gy

            # Top-left ambient cyan glow
            glow1 = math.exp(-((gx - 0.25) ** 2 + (gy - 0.22) ** 2) * 5.2)
            glow2 = math.exp(-((gx - 0.76) ** 2 + (gy - 0.74) ** 2) * 4.5)
            bg_r += glow1 * 18 + glow2 * 56
            bg_g += glow1 * 76 + glow2 * 24
            bg_b += glow1 * 112 + glow2 * 96

            # Subtle inner rim highlight
            rim = max(0.0, min(1.0, (d_sq - 0.90) * 14.0)) * (1.0 - max(0.0, (d_sq - 0.97) * 28.0))
            col = (bg_r, bg_g, bg_b, 255.0 * edge_aa)
            if rim > 0:
                col = blend(col, 148, 200, 255, rim * 0.28)

            # Draw glowing branches
            d_main = dist_seg(x + 0.5, y + 0.5, n_bot[0], n_bot[1], n_top[0], n_top[1])
            d_fork = dist_seg(x + 0.5, y + 0.5, n_mid[0], n_mid[1], n_br[0], n_br[1])
            d_sub  = dist_seg(x + 0.5, y + 0.5, n_br[0], n_br[1], n_br2[0], n_br2[1])

            for d_line, (lr, lg, lb) in [
                (d_main, (56, 189, 248)),
                (d_fork, (167, 139, 250)),
                (d_sub, (16, 185, 129)),
            ]:
                if d_line < stroke_w * 2.2:
                    halo = math.exp(-((d_line / (stroke_w * 1.4)) ** 2)) * 0.35
                    col = blend(col, lr, lg, lb, halo)
                aa = max(0.0, min(1.0, (stroke_w - d_line) * 1.4 + 0.5))
                if aa > 0:
                    col = blend(col, lr, lg, lb, aa)

            # Draw luminous nodes
            nodes = [
                (n_bot, (56, 189, 248)),
                (n_top, (56, 189, 248)),
                (n_br,  (167, 139, 250)),
                (n_br2, (16, 185, 129)),
            ]
            for (px, py), (nr, ng, nb) in nodes:
                dn = math.hypot(x + 0.5 - px, y + 0.5 - py)
                if dn < node_r * 2.2:
                    halo = math.exp(-((dn / (node_r * 1.35)) ** 2)) * 0.45
                    col = blend(col, nr, ng, nb, halo)
                outer_aa = max(0.0, min(1.0, (node_r - dn) * 1.5 + 0.5))
                if outer_aa > 0:
                    col = blend(col, nr, ng, nb, outer_aa)
                inner_aa = max(0.0, min(1.0, (inner_r - dn) * 1.5 + 0.5))
                if inner_aa > 0:
                    col = blend(col, 245, 250, 255, inner_aa)

            idx = (y * size + x) * 4
            buf[idx] = clamp(col[0])
            buf[idx + 1] = clamp(col[1])
            buf[idx + 2] = clamp(col[2])
            buf[idx + 3] = clamp(col[3] * edge_aa)
    return bytes(buf)


def encode_png(width, height, rgba):
    def chunk(tag, data):
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def write_ico(path, png_list):
    # Modern Windows ICO embeds PNG payloads directly for all sizes
    count = len(png_list)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + count * 16
    entries = bytearray()
    body = bytearray()
    for size, png_bytes in png_list:
        w = 0 if size >= 256 else size
        h = 0 if size >= 256 else size
        entries.extend(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png_bytes), offset))
        body.extend(png_bytes)
        offset += len(png_bytes)
    with open(path, "wb") as f:
        f.write(header + bytes(entries) + bytes(body))


if __name__ == "__main__":
    sizes = [16, 32, 48, 64, 128, 256]
    pngs = []
    for sz in sizes:
        rgba = render_rgba(sz)
        png = encode_png(sz, sz, rgba)
        pngs.append((sz, png))
        if sz == 256:
            with open(os.path.join(OUT_DIR, "icon.png"), "wb") as f:
                f.write(png)
    write_ico(os.path.join(OUT_DIR, "icon.ico"), pngs)
    print("Generated icon.png and icon.ico successfully!")
