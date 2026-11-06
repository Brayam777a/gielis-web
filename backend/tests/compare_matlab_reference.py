
from __future__ import annotations
import argparse, json
from pathlib import Path
import numpy as np
from gielis_geometry import GielisGeometryService, GielisParameters, ConcentricParameters

def max_abs(a,b):
    a=np.asarray(a,float); b=np.asarray(b,float)
    n=min(len(a),len(b))
    return float(np.max(np.abs(a[:n]-b[:n]))) if n else float("inf")

def load_cases(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("matlab_json")
    ap.add_argument("--cases-dir", default=".")
    ap.add_argument("--coord-tol", type=float, default=1e-8)
    ap.add_argument("--area-rel-tol", type=float, default=1e-7)
    args=ap.parse_args()

    ref=load_cases(args.matlab_json)
    svc=GielisGeometryService()
    failures=[]

    for name, rec in ref["cases"].items():
        cfg=load_cases(Path(args.cases_dir)/f"{name}_case_params.json")
        gp=cfg["gielis_parameters"]
        _,rho,x,y=svc.generate_curve(GielisParameters(**gp))
        base,base_poly=svc.radial_outer_envelope(x,y)

        cg=cfg["concentric_geometry"]
        cp=ConcentricParameters(
            size1=cg["size_1"], size2=cg["size_2"], gap_mm=cg["gap_mm"],
            rotation_deg=cg["rotation_deg"], dx_mm=cg["dx_mm"], dy_mm=cg["dy_mm"])
        c1,c2,c3,c4=svc.build_concentric(base[:-1],cp)

        print(f"\n[{name}]")
        print(f"  period u: Python={svc.period_multiplier(gp['m'],gp['a'],gp['b'],gp['n2'],gp['n3'])} MATLAB={rec['gielis']['period_multiplier_u']}")
        if svc.period_multiplier(gp['m'],gp['a'],gp['b'],gp['n2'],gp['n3']) != rec["gielis"]["period_multiplier_u"]:
            failures.append(f"{name}: period")

        py_base=base[:-1]
        ml_base=np.asarray(rec["base"]["points"],float)
        d=max_abs(py_base,ml_base)
        print(f"  base max |Δcoord| = {d:.3e}")
        if d > args.coord_tol:
            failures.append(f"{name}: base coordinates")

        for key,c in zip(("C1","C2","C3","C4"),(c1,c2,c3,c4)):
            ml=np.asarray(rec["concentric"][key],float)
            d=max_abs(c,ml)
            py_area=svc.polygon_from_contour(c).area
            ml_area=rec["concentric"][key+"_area_mm2"]
            rel=abs(py_area-ml_area)/max(abs(ml_area),1e-15)
            print(f"  {key}: max |Δcoord|={d:.3e}, area rel Δ={rel:.3e}")
            if d > args.coord_tol: failures.append(f"{name}: {key} coordinates")
            if rel > args.area_rel_tol: failures.append(f"{name}: {key} area")

        py_struct=svc.build_normal_geometry(c1,c2,c3,c4)
        for k,pg in (("ring1",py_struct.ring1),("ring2",py_struct.ring2),("normal",py_struct.normal)):
            ml_area=rec["boolean"][k+"_area_mm2"]
            rel=abs(pg.area-ml_area)/max(abs(ml_area),1e-15)
            print(f"  {k}: Boolean area rel Δ={rel:.3e}")
            if rel > args.area_rel_tol: failures.append(f"{name}: {k} boolean")

        if name=="transmitter":
            W=cfg["substrate"]["width_mm"]; L=cfg["substrate"]["length_mm"]
            top=np.array([[-W/2,-L/2],[W/2,-L/2],[W/2,L/2],[-W/2,L/2]])
            comp=svc.build_complementary_geometry(top,c1,c2,c3,c4)
            ml_area=rec["boolean"]["complementary_area_mm2"]
            rel=abs(comp.area-ml_area)/max(abs(ml_area),1e-15)
            print(f"  complementary: Boolean area rel Δ={rel:.3e}")
            if rel > args.area_rel_tol: failures.append(f"{name}: complementary boolean")

        if name=="sensor":
            tx,ty=svc.sensor_centering_translation([c1,c2,c3,c4],0,0)
            s1=svc.translate_contour(c1,tx,ty); s2=svc.translate_contour(c2,tx,ty)
            s3=svc.translate_contour(c3,tx,ty); s4=svc.translate_contour(c4,tx,ty)
            sen=svc.build_sensor_csrr(s1,s2,s3,s4,g_mm=cg["gap_mm"])
            for k,pg in (("ring1_slot",sen.ring1_slot),("ring2_slot",sen.ring2_slot),
                         ("bridge1",sen.bridge1),("bridge2",sen.bridge2)):
                ml_area = rec["sensor"][("ring1_slot_area_mm2" if k=="ring1_slot" else
                                         "ring2_slot_area_mm2" if k=="ring2_slot" else
                                         "bridge1" if k=="bridge1" else "bridge2")]
                if isinstance(ml_area, dict): ml_area=ml_area["area"]
                rel=abs(pg.area-float(ml_area))/max(abs(float(ml_area)),1e-15)
                print(f"  {k}: area rel Δ={rel:.3e}")
                if rel > args.area_rel_tol: failures.append(f"{name}: {k}")

    if failures:
        print("\nRESULT: FAIL")
        for f in failures: print(" -",f)
        raise SystemExit(1)
    print("\nRESULT: PASS")
if __name__=="__main__":
    main()
