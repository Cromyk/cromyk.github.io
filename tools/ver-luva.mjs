/**
 * Folha de conferência da LUVA de costura, nos seus eixos principais.
 *
 * Existe porque o rig dela foi discutido por duas sessões sem ninguém olhar a
 * malha: o cabeçalho de tools/luva.mjs chegou a afirmar coisas sobre os dedos
 * que a imagem desmente na hora. Uma luva é uma coisa que se reconhece de
 * relance, e nenhuma medição substitui isso.
 *
 * Desenha nos eixos do PCA, e não nos do arquivo: o OBJ do CLO3D vem torto em
 * relação aos eixos do mundo, e olhar por X, Y e Z não mostra nem a palma nem
 * o perfil.
 *
 *   node tools/ver-luva.mjs   ->   folha-luva.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { desenharCelula } from './raster.mjs';
import { codificarPng } from './png.mjs';

const OBJ='C:/Users/marco.souza/Downloads/Gloves_Qa/Gloves_Qa.obj';
const pos=[], tris=[];
for(const linha of readFileSync(OBJ,'utf8').split('\n')){
  if(linha[0]==='v'&&linha[1]===' '){const p=linha.split(/\s+/);pos.push(+p[1],+p[2],+p[3]);}
  else if(linha[0]==='f'&&linha[1]===' '){
    const idx=linha.trim().split(/\s+/).slice(1).map(cc=>{const q=Number(cc.split('/')[0]);return q>0?q-1:pos.length/3+q;});
    for(let i=1;i+1<idx.length;i++) tris.push([idx[0],idx[i],idx[i+1]]);
  }
}
const n=pos.length/3;
const v=(i)=>[pos[i*3],pos[i*3+1],pos[i*3+2]];
console.log(`${n} vertices, ${tris.length} triangulos`);

// eixos PCA medidos
const eixo=[-0.121,0.957,0.262], lat=[0.992,0.128,-0.007];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const nrm=cross(eixo,lat);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const c=[0,0,0];
for(let i=0;i<n;i++){const p=v(i);for(let k=0;k<3;k++)c[k]+=p[k];}
for(let k=0;k<3;k++)c[k]/=n;
// reprojeta para o espaco PCA: X=lat, Y=eixo, Z=nrm
const proj=(i)=>{const p=[v(i)[0]-c[0],v(i)[1]-c[1],v(i)[2]-c[2]];return [dot(p,lat),dot(p,eixo),dot(p,nrm)];};
const P=[]; for(let i=0;i<n;i++)P.push(proj(i));
const T=tris.map(t=>({a:P[t[0]],b:P[t[1]],c:P[t[2]],cor:[0.72,0.74,0.80]}));

const CEL=420, FUNDO=[20,24,34];
const VISTAS=[
  {rot:'de frente (plano da palma)', f:(p)=>[p[0],p[1],-p[2]]},
  {rot:'de lado',                    f:(p)=>[p[2],p[1],p[0]]},
  {rot:'de cima (pontas)',           f:(p)=>[p[0],p[2],-p[1]]},
];
const larg=CEL*VISTAS.length, alt=CEL;
const rgba=new Uint8Array(larg*alt*4);
for(let i=0;i<larg*alt;i++){rgba[i*4]=FUNDO[0];rgba[i*4+1]=FUNDO[1];rgba[i*4+2]=FUNDO[2];rgba[i*4+3]=255;}

let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
for(const p of P)for(let k=0;k<3;k++){if(p[k]<mn[k])mn[k]=p[k];if(p[k]>mx[k])mx[k]=p[k];}
const span=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]);
console.log('bbox PCA:',mx.map((x,i)=>(x-mn[i]).toFixed(1)).join(' x '));

VISTAS.forEach((vis,k)=>{
  const esc=CEL*0.82/span;
  desenharCelula({
    rgba, largura:larg, ox:k*CEL, oy:0, celula:CEL, tris:T,
    naTela:(p)=>{const [x,y,z]=vis.f(p);return [k*CEL+CEL/2+x*esc, CEL/2-y*esc, z];},
  });
});
writeFileSync('folha-luva.png', codificarPng(larg,alt,rgba));
console.log('-> folha-luva.png');
