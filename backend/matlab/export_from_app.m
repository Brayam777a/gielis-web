function export_from_app(app, case_name, output_json)
% EXPORT_FROM_APP  Guarda la geometría que calculó la app REAL (GielisMetaCST)
% para compararla con la versión en Python.
%
% Uso, en la ventana de comandos de MATLAB:
%   1. app = GielisMetaCST;      % abre la app y guarda su referencia
%   2. En la app: elige el modo, escribe los parámetros del caso
%      (examples/<caso>_case_params.json), pulsa Preview y luego
%      Generate structure.
%   3. export_from_app(app, "absorber", "C:\ruta\absorber_app.json")
%   4. Repite con "transmitter" y "sensor".
%
% A diferencia de export_geometry_reference.m (que reimplementa la lógica),
% este script lee lo que la app guardó en sus propiedades, así que es la
% referencia válida para decir "Python = app".

if isempty(app.contornosConcentricos) || numel(app.contornosConcentricos) < 4
    error("export_from_app:noGeometry", ...
        "La app no tiene contornos. Pulsa Preview y Generate structure primero.");
end

C = app.contornosConcentricos;

rec = struct();
rec.case = string(case_name);
rec.exported_at = string(datetime('now','Format','yyyy-MM-dd HH:mm:ss'));
rec.matlab_version = string(version);
rec.gielis = struct( ...
    'a', app.aSpinner.Value, 'b', app.bSpinner.Value, 'm', app.mSpinner.Value, ...
    'n1', app.n1Spinner.Value, 'n2', app.n2Spinner.Value, 'n3', app.n3Spinner.Value);
rec.gap_mm = app.gmmSpinner.Value;
rec.scale_1 = app.escalaFigura1;
rec.scale_2 = app.escalaFigura2;

% Contornos finales C1..C4 (ya escalados, rotados, trasladados y, en el
% sensor, centrados), tal como los usa la app para construir en CST.
rec.C1 = C{1}; rec.C2 = C{2}; rec.C3 = C{3}; rec.C4 = C{4};

rec.C1_area_mm2 = area(polyshape(C{1}(:,1), C{1}(:,2)));
rec.C2_area_mm2 = area(polyshape(C{2}(:,1), C{2}(:,2)));
rec.C3_area_mm2 = area(polyshape(C{3}(:,1), C{3}(:,2)));
rec.C4_area_mm2 = area(polyshape(C{4}(:,1), C{4}(:,2)));

if ~isempty(app.pgGielisExterior) && area(app.pgGielisExterior) > 0
    rec.base_area_mm2 = area(app.pgGielisExterior);
end

fid = fopen(output_json, 'w');
fprintf(fid, '%s', jsonencode(rec, 'PrettyPrint', true));
fclose(fid);
fprintf("Geometría de la app guardada en %s\n", output_json);
end
