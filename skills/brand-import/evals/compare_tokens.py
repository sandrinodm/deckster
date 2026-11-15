# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Compare an imported brand with the brand its source was rendered from (a round-trip eval).

Usage:
  pnpm --silent deck brand <truth> --json > truth.json
  pnpm --silent deck brand <candidate> --json > candidate.json
  uv run compare_tokens.py truth.json candidate.json [--json]

Both files are resolved tokens, so palette references and derived values are already hex. Prints,
per group, how close the candidate is: role colours per surface (OKLab distance x100; under 3 is
invisible, under 6 close), font families and substitutes, type scale (size ratio), radii, margins,
gradients, logo, data palette. Exit code 0 always: this is a report for a grader, not a gate.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
import _common as C  # noqa: E402

ROLES = ("bg", "surface", "fg", "heading", "muted", "accent", "accent-fg", "border", "positive", "negative")


def de(a: str, b: str) -> float:
    try:
        return round(C.delta_e(C.norm_hex(a[:7]), C.norm_hex(b[:7])), 1)
    except Exception:  # noqa: BLE001
        return 99.0


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    truth, cand = (json.loads(Path(p).read_text()) for p in args[:2])
    out: dict = {"surfaces": {}, "summary": {}}
    close = total = 0
    for name, ts in truth["surfaces"].items():
        cs = cand["surfaces"].get(name)
        if not cs:
            out["surfaces"][name] = "missing"
            continue
        rows = {}
        for role in ROLES:
            t, c = ts["roles"].get(role), cs["roles"].get(role)
            if t and c:
                d = de(t, c)
                rows[role] = {"truth": t, "got": c, "dE": d}
                total += 1
                close += d <= 6
        out["surfaces"][name] = rows
    out["summary"]["roles_within_dE6"] = f"{close}/{total}"

    tpal = [h for scale in truth["palette"].values() for h in scale.values()]
    cpal = [h for scale in cand["palette"].values() for h in scale.values()]
    found = sum(1 for t in tpal if any(de(t, c) <= 3 for c in cpal))
    out["summary"]["truth_palette_steps_found_in_candidate"] = f"{found}/{len(tpal)}"

    fam = {}
    for role in ("display", "body", "mono"):
        t, c = truth["typography"]["families"][role], cand["typography"]["families"][role]
        fam[role] = {"truth": t["family"], "got": c["family"], "match": t["family"].lower() == c["family"].lower(),
                     "source": c.get("source", {}).get("kind"), "substitute_truth": t["substitute"]["family"], "substitute_got": c["substitute"]["family"],
                     "substitute_kind_ok": t["substitute"]["category"] == c["substitute"]["category"]}
    out["families"] = fam

    scale = {}
    tsc, csc = truth["typography"]["scale"], cand["typography"]["scale"]
    for step, t in tsc.items():
        c = csc.get(step, {})
        if c:
            scale[step] = {"truth": t["size"], "got": c["size"], "ratio": round(c["size"] / t["size"], 2), "family_ok": t.get("family") == c.get("family"),
                           "weight": [t.get("weight"), c.get("weight")]}
    out["scale"] = scale
    out["summary"]["scale_within_15pct"] = f"{sum(1 for s in scale.values() if 0.85 <= s['ratio'] <= 1.15)}/{len(scale)}"

    out["radius"] = {"truth": truth["shape"]["radius"], "got": cand["shape"]["radius"]}
    out["margin"] = {"truth": truth["spacing"]["margin"], "got": cand["spacing"]["margin"]}
    out["gradients"] = {"truth": {k: v["type"] for k, v in truth["gradients"].items()}, "got": {k: v["type"] for k, v in cand["gradients"].items()}}
    out["logo"] = {"truth": list(truth["logo"]["variants"]), "got": list(cand["logo"]["variants"]), "placement": [truth["logo"]["placement"], cand["logo"]["placement"]]}
    out["chrome"] = {"truth": truth["chrome"], "got": cand["chrome"]}
    tcat, ccat = truth["data"]["categorical"], cand["data"]["categorical"]
    out["data"] = {"categorical_truth": tcat, "categorical_got": ccat, "truth_colours_present": f"{sum(1 for t in tcat if any(de(t, c) <= 6 for c in ccat))}/{len(tcat)}",
                   "first_matches": de(tcat[0], ccat[0]) <= 6}
    out["icons"] = [truth.get("icons"), cand.get("icons")]

    if "--json" in sys.argv:
        print(json.dumps(out, indent=2))
        return
    print("SUMMARY", json.dumps(out["summary"]))
    for name, rows in out["surfaces"].items():
        if rows == "missing":
            print(f"surface {name}: MISSING")
            continue
        print(f"surface {name}: " + "  ".join(f"{r}={v['dE']}" + ("" if v["dE"] <= 6 else f"({v['truth']}->{v['got']})") for r, v in rows.items()))
    for role, f in fam.items():
        print(f"family {role}: {f['truth']} -> {f['got']} [{'ok' if f['match'] else 'DIFFERENT'}; {f['source']}] substitute {f['substitute_truth']} -> {f['substitute_got']} [{'ok' if f['substitute_kind_ok'] else 'WRONG KIND'}]")
    print("scale: " + "  ".join(f"{k} {v['truth']}->{v['got']} (x{v['ratio']})" for k, v in scale.items()))
    for key in ("radius", "margin", "gradients", "logo", "data", "icons"):
        print(f"{key}: {json.dumps(out[key])}")


if __name__ == "__main__":
    main()
