"""Experimental cut and pattern generation; never modifies source GLBs."""
from __future__ import annotations
import json, struct
from pathlib import Path
import numpy as np
import trimesh
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'outputs/garments/tshirt-v2-mhr-neutral.glb'
TARGET=ROOT/'outputs/garments/experiments/tshirt-v6-sleeve-mhr-neutral.glb'

def load():
 raw=SOURCE.read_bytes(); length=struct.unpack_from('<I',raw,12)[0]; document=json.loads(raw[20:20+length]); offset=28+length
 primitive=document['meshes'][0]['primitives'][0]
 def access(index):
  item=document['accessors'][index]; view=document['bufferViews'][item['bufferView']]
  dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[item['componentType']]; width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[item['type']]
  return np.frombuffer(raw,dtype=dtype,count=item['count']*width,offset=offset+view.get('byteOffset',0)+item.get('byteOffset',0)).reshape(-1,width).copy()
 return document,{k:access(i) for k,i in primitive['attributes'].items()},access(primitive['indices']).reshape(-1,3),raw[offset:]

def trim():
 doc,attr,faces,blob=load(); pos=attr['POSITION']
 _,first,inv=np.unique(np.round(pos,6),axis=0,return_index=True,return_inverse=True)
 values={k:arr[first].astype(float).tolist() for k,arr in attr.items()}; vertices=np.array(values['POSITION']); faces=inv[faces]
 print('initial:',len(vertices),len(faces),flush=True)
 for side in [-1,1]:
  # Trim the arm above the torso side seam. Curving the shoulder cut creates the cap.
  pos=np.array(values['POSITION']); cut=np.minimum(side*pos[:,0]-(0.205+0.10*(pos[:,1]-1.37)), pos[:,1]-1.285)
  cache={}; new_faces=[]
  def intersection(a,b):
   key=tuple(sorted((a,b)))
   if key in cache:return cache[key]
   t=cut[a]/(cut[a]-cut[b]); ix=len(values['POSITION']);cache[key]=ix
   for name in values:
    va=np.asarray(values[name][a]);vb=np.asarray(values[name][b]); val=va*(1-t)+vb*t
    if name=='JOINTS_0': val=va if t<0.5 else vb
    if name=='WEIGHTS_0': val=np.asarray(values[name][a] if t<0.5 else values[name][b])
    values[name].append(val.tolist())
   return ix
  for tri in faces:
   polygon=[]
   for a,b in zip(tri,np.roll(tri,-1)):
    if cut[a]<=0:polygon.append(int(a))
    if (cut[a]<=0)!=(cut[b]<=0):polygon.append(intersection(int(a),int(b)))
   if len(polygon)>=3:
    for i in range(1,len(polygon)-1):new_faces.append([polygon[0],polygon[i],polygon[i+1]])
  faces=np.array(new_faces,dtype=int);print('trim side',side,'faces',len(faces),'new',len(cache),flush=True)
  edges=np.sort(np.concatenate((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]])),axis=1);edges,counts=np.unique(edges,axis=0,return_counts=True);b=edges[counts==1]
  verts=np.array(values['POSITION']); graph=coo_matrix((np.ones(len(b)*2),(np.r_[b[:,0],b[:,1]],np.r_[b[:,1],b[:,0]])),shape=(len(verts),len(verts))).tocsr();_, labels=connected_components(graph,directed=False); groups={}
  for i in np.unique(b):groups.setdefault(labels[i],[]).append(i)
  print('boundary groups:',[(len(x),np.mean(verts[x],axis=0).round(4).tolist()) for x in sorted(groups.values(),key=len,reverse=True)[:8]],flush=True)
 return doc,values,faces,blob

def build():
 if TARGET.exists(): raise FileExistsError(f"Refusing to overwrite {TARGET}")
 doc,values,faces,blob=trim()
 v=np.asarray(values['POSITION']); directed=np.concatenate((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]))
 _,inverse,counts=np.unique(np.sort(directed,axis=1),axis=0,return_inverse=True,return_counts=True)
 boundary=directed[counts[inverse]==1]
 names=[doc['nodes'][i]['name'] for i in doc['skins'][0]['joints']]
 faces=faces.tolist()
 for side in (-1,1):
  selected=boundary[(v[boundary].mean(axis=1)[:,0]*side)>0]
  forward={int(a):int(b) for a,b in selected}
  if len(forward)!=len(selected):raise ValueError('Non-manifold seam')
  loop=[next(iter(forward))]
  while True:
   nxt=forward[loop[-1]]
   if nxt==loop[0]:break
   if nxt in loop:raise ValueError('Self-connected seam')
   loop.append(nxt)
  if len(loop)!=len(selected):raise ValueError('Multiple armhole loops')
  seam=v[loop]; axis=np.array([side*0.75,-0.6614378278,0.]); axis/=np.linalg.norm(axis)
  cap=seam@axis; cap_height=float(cap.max()-cap.min()); length=(cap.max()-cap)+0.11
  distance=np.r_[0,np.cumsum(np.linalg.norm(np.diff(seam,axis=0),axis=1))]; width=distance[-1]+np.linalg.norm(seam[0]-seam[-1])
  # Pattern coordinates: circumference u and cap-to-cuff axial v; the seam is the cap curve.
  pattern=np.column_stack((distance,cap-cap.min()))
  if cap_height<0.015:raise ValueError('Insufficient sleeve cap height')
  old=np.asarray(loop); joint=names.index('l_uparm' if side>0 else 'r_uparm')
  original_j=np.asarray([values['JOINTS_0'][i] for i in loop],dtype=int); original_w=np.asarray([values['WEIGHTS_0'][i] for i in loop]); count=len(loop)
  for row in range(1,13):
   t=row/12; ids=np.arange(len(values['POSITION']),len(values['POSITION'])+count)
   for k,index in enumerate(loop):
    point=seam[k]+t*length[k]*axis
    dense=np.zeros(len(names)); np.add.at(dense,original_j[k],original_w[k]*(1-t));dense[joint]+=t
    top=np.argsort(dense)[-4:][::-1]; w=dense[top];w/=w.sum()
    values['POSITION'].append(point.tolist());values['NORMAL'].append([0.,0.,1.]);values['TEXCOORD_0'].append([float(pattern[k,0]/width),float(t)]);values['JOINTS_0'].append(top.tolist());values['WEIGHTS_0'].append(w.tolist());values['_REGION'].append([float(1 if side>0 else 2)])
   for k in range(count):
    n=(k+1)%count;a=int(old[k]);b=int(old[n]);c=int(ids[k]);d=int(ids[n]);faces.extend(([b,a,c],[b,c,d]))
   old=ids
  print('side',side,'pattern width',round(width,4),'cap height',round(cap_height,4),'minimum underarm length',round(length.min(),4),'cuff remains open',flush=True)
 faces=np.asarray(faces,dtype=np.uint32); used=np.unique(faces);remap=np.full(len(values['POSITION']),-1,dtype=int);remap[used]=np.arange(len(used));faces=remap[faces].astype('<u4')
 attrs={k:np.asarray(arr)[used] for k,arr in values.items()}; pos=attrs['POSITION'].astype('<f4')
 normal=np.zeros_like(pos,dtype=np.float64); tri=pos[faces]; n=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);
 for k in range(3):np.add.at(normal,faces[:,k],n)
 normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-15);attrs['NORMAL']=normal.astype('<f4')
 formats={'POSITION':('<f4',5126,'VEC3'),'NORMAL':('<f4',5126,'VEC3'),'TEXCOORD_0':('<f4',5126,'VEC2'),'JOINTS_0':('<u2',5123,'VEC4'),'WEIGHTS_0':('<f4',5126,'VEC4'),'_REGION':('<f4',5126,'SCALAR')}
 data=bytearray(blob)
 def append(array,ctype,kind,target):
  while len(data)%4:data.append(0)
  start=len(data);data.extend(array.tobytes());view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':array.nbytes,'target':target})
  accessor={'bufferView':view,'componentType':ctype,'count':len(array),'type':kind}
  if kind=='VEC3' and target==34962:accessor.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
  ix=len(doc['accessors']);doc['accessors'].append(accessor);return ix
 primitive=doc['meshes'][0]['primitives'][0]
 for name,(dtype,ctype,kind) in formats.items():primitive['attributes'][name]=append(attrs[name].astype(dtype),ctype,kind,34962)
 primitive['indices']=append(faces.reshape(-1).astype('<u4'),5125,'SCALAR',34963)
 info=doc['asset'].setdefault('extras',{}).setdefault('garment',{});info['garmentId']='tshirt-v6-pattern-experiment';info['revision']='v6-experiment';info['fit']['strategy']='experimental ruled 2D sleeve cap and extended cuff, sewn to trimmed v2 torso; open shell boundaries'
 doc['buffers'][0]['byteLength']=len(data); encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
 while len(data)%4:data.append(0)
 glb=struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(data))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(data),b'BIN\0')+data
 TARGET.parent.mkdir(parents=True,exist_ok=True)
 with TARGET.open('xb') as out:out.write(glb)
 mesh=trimesh.Trimesh(pos,faces,process=False)
 print('output',TARGET,'vertices',len(pos),'faces',len(faces),'watertight',mesh.is_watertight,flush=True)

if __name__=='__main__':build()
