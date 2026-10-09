"""Independent Pynite reference in m/kN; never imports the application's solver."""
import json
import math
import sys
from importlib.metadata import version
import numpy as np
from Pynite import FEModel3D

models = json.load(open('tests/fixtures/space/reference-models.json'))['models']
outputs = []
for fixture in models:
    model = FEModel3D()
    dofs = ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ']
    for node in fixture['nodes']:
        name = f"N{node['id']}"
        model.add_node(name, node['x'], node['y'], node['z'])
        model.def_support(name, *node['restraints'])
        for dof, stiffness in zip(dofs, node.get('springStiffness', [0]*6)):
            if stiffness > 0:
                model.def_support_spring(name, dof, stiffness)
    for element in fixture['elements']:
        name = f"M{element['id']}"
        nu = element.get('nu', 0.3)
        E = element['E']*1e6
        model.add_material(name, E, E/(2*(1+nu)), nu, 0)
        model.add_section(name, element['A']*1e-4, element['Iy']*1e-6, element['Iz']*1e-6, element['J']*1e-6)
        model.add_member(name, f"N{element['startNode']}", f"N{element['endNode']}", name, name)
        member = model.members[name]
        axes = member.T()[:3, :3]
        target_y = np.array(element['referenceY'])
        member.rotation = math.degrees(math.atan2(np.dot(target_y, axes[2]), np.dot(target_y, axes[1])))
        if not np.allclose(member.T()[1, :3], target_y, atol=1e-12):
            raise ValueError(f"{fixture['name']}: local-axis mapping failed")
        releases = {f"R{axis[-1]}{suffix}": value for end, suffix in [('releaseStart','i'), ('releaseEnd','j')] for axis, value in element.get(end, {}).items()}
        model.def_releases(name, **releases)
    for load in fixture['loads']:
        if load['type'] in ['point', 'moment']:
            direction = ('F' if load['type'] == 'point' else 'M') + load['direction'].upper()
            model.add_node_load(f"N{load['nodeId']}", direction, load['magnitude'], 'D')
        else:
            direction = 'F' + (load['direction'] if load.get('coordinateSystem','global') == 'local' else load['direction'].upper())
            model.add_member_dist_load(f"M{load['elementId']}", direction, load['startMagnitude'], load['endMagnitude'], case='D')
    model.add_load_combo('Reference', {'D': 1.0})
    model.analyze_linear(log=False, check_stability=True, sparse=True)
    nodes = [{'nodeId': node['id'], 'displacement': [float(getattr(model.nodes[f"N{node['id']}"], dof)['Reference']) for dof in dofs], 'reaction': [float(getattr(model.nodes[f"N{node['id']}"], 'Rxn'+dof)['Reference']) for dof in ['FX','FY','FZ','MX','MY','MZ']]} for node in fixture['nodes']]
    members = []
    for element in fixture['elements']:
        member = model.members[f"M{element['id']}"]
        # Fixtures have no internal member nodes, so each physical member has one sub-member.
        sub = list(member.sub_members.values())
        if len(sub) != 1:
            raise ValueError('Unexpected automatic subdivision in reference fixture')
        members.append({'elementId': element['id'], 'localEndForces': sub[0].f('Reference').ravel().tolist(), 'curve': [{'r': r, 'local': [float(member.deflection(dof, r*member.L(), 'Reference')) for dof in ['dx','dy','dz']]} for r in [0, .25, .5, .75, 1]]})
    outputs.append({'name': fixture['name'], 'nodes': nodes, 'members': members})
report = {'reference': 'PyniteFEA', 'version': version('PyniteFEA'), 'numpy': version('numpy'), 'scipy': version('scipy'), 'python': sys.version, 'units': 'm, kN, rad', 'models': outputs}
print(json.dumps(report, indent=2))
