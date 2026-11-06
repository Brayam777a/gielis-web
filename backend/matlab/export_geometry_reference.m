
function export_geometry_reference(cases_dir, output_json)
% Export MATLAB geometry reference data for Absorber, Transmitter and Sensor.
%
% This script intentionally mirrors the geometry semantics extracted from
% GielisMetaCST.mlapp:
%   - Gielis curve: 8000 samples
%   - period rule based on rat(m)
%   - radial outer envelope: 720 bins + circular interpolation + movmean(5)
%   - concentric C1..C4 scaling using physical gap in mm
%   - Normal = (C1-C2) + (C3-C4)
%   - Complementary = top copper - Normal
%   - Sensor CSRR split bridges at +pi/2 and -pi/2
%
% Run in MATLAB:
%   export_geometry_reference("C:\path\to\cases", ...
%                             "C:\path\to\matlab_geometry_reference.json")

if nargin < 1 || isempty(cases_dir)
    cases_dir = pwd;
end
if nargin < 2 || isempty(output_json)
    output_json = fullfile(cases_dir, "matlab_geometry_reference.json");
end

names = ["absorber","transmitter","sensor"];
out = struct();
out.schema_version = 1;
out.source = "GielisMetaCST.mlapp geometry reference exporter";
out.cases = struct();

for i = 1:numel(names)
    name = names(i);
    fn = fullfile(cases_dir, name + "_case_params.json");
    txt = fileread(fn);
    cfg = jsondecode(txt);

    a  = cfg.gielis_parameters.a;
    b  = cfg.gielis_parameters.b;
    m  = cfg.gielis_parameters.m;
    n1 = cfg.gielis_parameters.n1;
    n2 = cfg.gielis_parameters.n2;
    n3 = cfg.gielis_parameters.n3;

    [num, den] = rat(m);
    if mod(num,2) == 0 || (a == b && n2 == n3)
        u = 2*den;
    else
        u = 4*den;
    end

    theta = linspace(0, u*pi, 8000);
    rho = ( ...
        abs(cos(m.*theta./4)./a).^n2 + ...
        abs(sin(m.*theta./4)./b).^n3 ...
        ).^(-1/n1);

    x = rho .* cos(theta);
    y = rho .* sin(theta);

    [base, base_poly] = radial_outer_envelope_reference(x, y, 720, 5);

    cg = cfg.concentric_geometry;
    [C1,C2,C3,C4,actual_g,actual_s2] = concentric_reference( ...
        base, cg.size_1, cg.size_2, cg.gap_mm, ...
        cg.rotation_deg, cg.dx_mm, cg.dy_mm);

    P1 = polyshape(C1(:,1), C1(:,2), ...
        'Simplify', true, 'KeepCollinearPoints', false);
    P2 = polyshape(C2(:,1), C2(:,2), ...
        'Simplify', true, 'KeepCollinearPoints', false);
    P3 = polyshape(C3(:,1), C3(:,2), ...
        'Simplify', true, 'KeepCollinearPoints', false);
    P4 = polyshape(C4(:,1), C4(:,2), ...
        'Simplify', true, 'KeepCollinearPoints', false);

    R1 = subtract(P1,P2);
    R2 = subtract(P3,P4);
    NORMAL = union(R1,R2);

    rec = struct();
    rec.source_json = name + "_case_params.json";
    rec.gielis = struct( ...
        'a',a,'b',b,'m',m,'n1',n1,'n2',n2,'n3',n3, ...
        'period_multiplier_u',u, ...
        'sample_count',numel(theta), ...
        'rho_min',min(rho), ...
        'rho_max',max(rho));

    rec.base = struct( ...
        'points', base, ...
        'area_mm2', area(base_poly), ...
        'bounds_mm', bounds_of_points(base));

    rec.concentric = struct( ...
        'requested_size1',cg.size_1, ...
        'requested_size2',cg.size_2, ...
        'actual_gap_mm',actual_g, ...
        'actual_size2',actual_s2, ...
        'rotation_deg',cg.rotation_deg, ...
        'dx_mm',cg.dx_mm, ...
        'dy_mm',cg.dy_mm, ...
        'C1',C1,'C2',C2,'C3',C3,'C4',C4, ...
        'C1_area_mm2',area(P1), ...
        'C2_area_mm2',area(P2), ...
        'C3_area_mm2',area(P3), ...
        'C4_area_mm2',area(P4));

    rec.boolean = struct( ...
        'ring1_area_mm2',area(R1), ...
        'ring2_area_mm2',area(R2), ...
        'normal_area_mm2',area(NORMAL));

    if strcmpi(name,"transmitter")
        W = cfg.substrate.width_mm;
        L = cfg.substrate.length_mm;
        top = polyshape([-W/2 W/2 W/2 -W/2], ...
                        [-L/2 -L/2 L/2 L/2], ...
                        'Simplify',true);
        COMPLEMENTARY = subtract(subtract(top,R1),R2);
        rec.boolean.top_copper_area_mm2 = area(top);
        rec.boolean.complementary_area_mm2 = area(COMPLEMENTARY);
    end

    if strcmpi(name,"sensor")
        allxy = [C1;C2;C3;C4];
        cx = (min(allxy(:,1))+max(allxy(:,1)))/2;
        cy = (min(allxy(:,2))+max(allxy(:,2)))/2;
        % C1..C4 already include dx/dy; sensor centering in the app is
        % applied by totalDx=-cx+dx and totalDy=-cy+dy.
        tx = -cx + cg.dx_mm;
        ty = -cy + cg.dy_mm;

        S1 = C1 + [tx ty];
        S2 = C2 + [tx ty];
        S3 = C3 + [tx ty];
        S4 = C4 + [tx ty];

        [B1, B2] = sensor_bridges_reference(S1,S2,S3,S4,actual_g);

        Q1 = subtract(polyshape(S1(:,1),S1(:,2), ...
             'Simplify',true), polyshape(S2(:,1),S2(:,2),'Simplify',true));
        Q2 = subtract(polyshape(S3(:,1),S3(:,2), ...
             'Simplify',true), polyshape(S4(:,1),S4(:,2),'Simplify',true));

        Q1 = subtract(Q1, B1);
        Q2 = subtract(Q2, B2);
        CUTTERS = union(Q1,Q2);

        rec.sensor = struct( ...
            'centering_translation_mm',[tx ty], ...
            'C1',S1,'C2',S2,'C3',S3,'C4',S4, ...
            'bridge1',vertices(B1), ...
            'bridge2',vertices(B2), ...
            'ring1_slot_area_mm2',area(Q1), ...
            'ring2_slot_area_mm2',area(Q2), ...
            'cutters_area_mm2',area(CUTTERS));
    end

    out.cases.(name) = rec;
end

fid = fopen(output_json,'w');
fprintf(fid,'%s',jsonencode(out,'PrettyPrint',true));
fclose(fid);
fprintf("Wrote %s\n",output_json);
end

function [coords, pg] = radial_outer_envelope_reference(x,y,nAng,smoothWindow)
phi = mod(atan2(y,x),2*pi);
r = hypot(x,y);
edges = linspace(0,2*pi,nAng+1);
[~,~,bin] = histcounts(phi,edges);

rmax = nan(1,nAng);
for k = 1:nAng
    q = r(bin == k);
    if ~isempty(q)
        rmax(k) = max(q);
    end
end

valid = find(~isnan(rmax));
if numel(valid) < 3
    error("Insufficient valid angular bins.");
end

idxExt = [valid-nAng, valid, valid+nAng];
rExt   = [rmax(valid), rmax(valid), rmax(valid)];
rfilled = interp1(idxExt,rExt,1:nAng,'linear','extrap');

% Como la app: cada vértice va en el CENTRO de su sector.
edgesOut = linspace(0,2*pi,nAng+1);
theta = 0.5*(edgesOut(1:end-1) + edgesOut(2:end));
rs = movmean(rfilled,smoothWindow,'Endpoints','discard');

% movmean(...,'Endpoints','discard') changes length for edge handling in
% some MATLAB versions; use explicit circular moving average instead.
h = floor(smoothWindow/2);
rpad = [rfilled(end-h+1:end), rfilled, rfilled(1:h)];
kernel = ones(1,smoothWindow)/smoothWindow;
rs = conv(rpad,kernel,'same');
rs = rs(h+1:h+nAng);

xx = rs .* cos(theta);
yy = rs .* sin(theta);
coords = [xx(:),yy(:)];
pg = polyshape(coords(:,1),coords(:,2), ...
              'Simplify',true,'KeepCollinearPoints',false);
pg = rmholes(pg);
if numel(pg) > 1
    ar = area(pg);
    [~,j] = max(ar);
    pg = pg(j);
end
coords = vertices(pg);
end

function [C1,C2,C3,C4,g,size2] = concentric_reference(base,size1,size2,g,rotDeg,dx,dy)
base = base(:,1:2);
if norm(base(1,:)-base(end,:)) < 1e-12
    base = base(1:end-1,:);
end

Rbase = max(hypot(base(:,1),base(:,2)));
minScale = 0.05;
offsetFactor = 0.10;
stepSize = 0.10;

if size1 <= minScale, size1 = 1.0; end
if size2 <= minScale, size2 = 0.7; end
if g <= 0, g = 0.10; end

scale1Outer = size1;
scale1Inner = size1 - g/Rbase;

interRingOffset = offsetFactor*g;
maxScale2Outer = scale1Inner - interRingOffset/Rbase;
minScale2Outer = minScale + g/Rbase;

if maxScale2Outer <= minScale2Outer
    gMax = (size1-2*minScale)*Rbase/(2+offsetFactor);
    g = 0.98*gMax;
    interRingOffset = offsetFactor*g;
    scale1Inner = size1-g/Rbase;
    maxScale2Outer = scale1Inner-interRingOffset/Rbase;
    minScale2Outer = minScale+g/Rbase;
end

if size2 < minScale2Outer
    size2 = ceil(minScale2Outer/stepSize)*stepSize;
    if size2 > maxScale2Outer
        size2 = minScale2Outer;
    end
end

if size2 > maxScale2Outer
    size2 = floor(maxScale2Outer/stepSize)*stepSize;
    if size2 < minScale2Outer
        size2 = maxScale2Outer;
    end
end

scale2Outer = size2;
scale2Inner = size2-g/Rbase;

if scale2Inner <= minScale
    size2 = minScale2Outer;
    scale2Outer = size2;
    scale2Inner = size2-g/Rbase;
end

C1 = transform(base,scale1Outer,rotDeg,dx,dy);
C2 = transform(base,scale1Inner,rotDeg,dx,dy);
C3 = transform(base,scale2Outer,rotDeg,dx,dy);
C4 = transform(base,scale2Inner,rotDeg,dx,dy);
end

function C = transform(base,s,rotDeg,dx,dy)
t = deg2rad(rotDeg);
R = [cos(t) -sin(t); sin(t) cos(t)];
C = (base*s)*R.';
C = C + [dx dy];
end

function [B1,B2] = sensor_bridges_reference(C1,C2,C3,C4,g)
B1 = split_bridge(C1,C2,pi/2,g);
B2 = split_bridge(C3,C4,-pi/2,g);
end

function B = split_bridge(outer,inner,targetAngle,g)
pout = outer;
pin = inner;

cx = (min(pout(:,1))+max(pout(:,1)))/2;
cy = (min(pout(:,2))+max(pout(:,2)))/2;

thetaOut = atan2(pout(:,2)-cy,pout(:,1)-cx);
d = angle(exp(1i*(thetaOut-targetAngle)));
[~,io] = min(abs(d));
pOuter = pout(io,:);

thetaTarget = atan2(pOuter(2)-cy,pOuter(1)-cx);
thetaIn = atan2(pin(:,2)-cy,pin(:,1)-cx);
d = angle(exp(1i*(thetaIn-thetaTarget)));
[~,ii] = min(abs(d));
pInner = pin(ii,:);

radial = pOuter-pInner;
Lrad = norm(radial);
n = radial/Lrad;
t = [-n(2) n(1)];

offset = max(0.02,min(0.10*Lrad,0.12*g));
L = Lrad+2*offset;
W = max(0.08,max(0.35*g,0.35*Lrad));
W = min(W,0.85*Lrad);

center = 0.5*(pOuter+pInner);
B = polyshape( ...
    center+0.5*W*t+0.5*L*n, ...
    center-0.5*W*t+0.5*L*n, ...
    center-0.5*W*t-0.5*L*n, ...
    center+0.5*W*t-0.5*L*n, ...
    'Simplify',true);
end

function b = bounds_of_points(p)
b = [min(p(:,1)) min(p(:,2)) max(p(:,1)) max(p(:,2))];
end
