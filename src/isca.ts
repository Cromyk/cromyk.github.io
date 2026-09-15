import * as THREE from 'three';
import type { TipoItem } from './itens';

/**
 * A isca: a fruta ou o doce na sua mão, e o rastro que sai dela até o Pokémon
 * que está sendo chamado.
 *
 * Existe porque a distância é um problema real dentro de um quarto. Um selvagem
 * nasce a até três metros e passeia em volta da âncora dele; chegar perto
 * aumenta o alarme e faz ele fugir. Então havia um jeito só de encurtar a
 * distância — andar até lá e torcer — e era o mesmo jeito que o assustava.
 *
 * Com a isca a distância vira uma escolha sua: você estende a mão com uma fruta,
 * aponta, e ele vem. Andando, ou flutuando, conforme o bicho (ver `voo` em
 * src/species.ts).
 *
 * O objeto é geometria simples de propósito. Ele fica a vinte centímetros dos
 * seus olhos, preso na luva, e o que precisa ler dali é **cor e silhueta** —
 * fruta redonda e vermelha com uma folha, doce alongado e roxo com as pontas
 * torcidas. Textura nenhuma sobreviveria a essa distância melhor do que isso.
 */
export class Isca {
  readonly grupo = new THREE.Group();
  readonly tipo: TipoItem;

  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private luz: THREE.PointLight;
  private tempo = 0;

  constructor(tipo: TipoItem) {
    this.tipo = tipo;

    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    const cor = new THREE.Color(tipo.cor);
    const material = guardar(
      new THREE.MeshStandardMaterial({
        color: cor,
        roughness: 0.32,
        metalness: 0.08,
        // Em passthrough a luz da cena é inventada; sem emissivo a isca some
        // contra um sofá escuro, e ela precisa ser vista de longe pelo jogador
        // tanto quanto pelo bicho.
        emissive: cor.clone().multiplyScalar(0.45),
      }),
    );

    if (tipo.id === 'doce') {
      // Bala de papel torcido: corpo alongado e duas pontinhas.
      const corpo = new THREE.Mesh(guardar(new THREE.CapsuleGeometry(0.018, 0.026, 4, 12)), material);
      corpo.rotation.z = Math.PI * 0.5;
      this.grupo.add(corpo);
      for (const lado of [-1, 1]) {
        const ponta = new THREE.Mesh(guardar(new THREE.ConeGeometry(0.016, 0.02, 10)), material);
        ponta.rotation.z = lado * Math.PI * 0.5;
        ponta.position.x = lado * 0.032;
        this.grupo.add(ponta);
      }
    } else {
      const fruta = new THREE.Mesh(guardar(new THREE.SphereGeometry(0.026, 16, 12)), material);
      fruta.scale.y = 0.88;
      this.grupo.add(fruta);

      const folha = new THREE.Mesh(
        guardar(new THREE.SphereGeometry(0.016, 8, 6)),
        guardar(
          new THREE.MeshStandardMaterial({
            color: 0x62c256,
            roughness: 0.5,
            emissive: new THREE.Color(0x2f7a2a),
          }),
        ),
      );
      folha.scale.set(1, 0.25, 0.55);
      folha.position.set(0.012, 0.024, 0);
      folha.rotation.z = 0.5;
      this.grupo.add(folha);
    }

    this.luz = new THREE.PointLight(cor, 0.5, 0.45, 2);
    this.grupo.add(this.luz);

    // Na frente dos dedos, onde um objeto segurado de verdade ficaria.
    this.grupo.position.set(0, 0.012, -0.075);
  }

  /** Um giro lento e um brilho que pulsa: isca parada não chama ninguém. */
  atualizar(dt: number, chamando: boolean) {
    this.tempo += dt;
    this.grupo.rotation.y += dt * (chamando ? 2.6 : 0.9);
    const pulso = 0.5 + Math.sin(this.tempo * (chamando ? 9 : 3)) * (chamando ? 0.45 : 0.15);
    this.luz.intensity = pulso;
    const escala = 1 + (chamando ? Math.sin(this.tempo * 9) * 0.07 : 0);
    this.grupo.scale.setScalar(escala);
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
  }
}

/**
 * O rastro de pontinhos entre a isca e quem está sendo chamado.
 *
 * É o único aviso de que a mira pegou. Sem ele, apontar a fruta para um canto
 * da sala e apontar para um Zubat parado no armário são o mesmo gesto, e o
 * jogador não descobre qual dos dois fez.
 */
export class RastroDeIsca {
  readonly pontos: THREE.Points;

  private geometria = new THREE.BufferGeometry();
  private material: THREE.PointsMaterial;
  private opacidade = 0;
  private tempo = 0;

  private static readonly PASSOS = 20;

  constructor(cor = 0xffd78a) {
    this.geometria.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(RastroDeIsca.PASSOS * 3), 3),
    );
    this.material = new THREE.PointsMaterial({
      color: cor,
      size: 0.016,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pontos = new THREE.Points(this.geometria, this.material);
    this.pontos.frustumCulled = false;
    this.pontos.visible = false;
  }

  atualizar(dt: number, de: THREE.Vector3 | null, para: THREE.Vector3 | null, forca: number) {
    this.tempo += dt;
    const alvo = de && para ? THREE.MathUtils.clamp(forca, 0, 1) : 0;
    this.opacidade += (alvo - this.opacidade) * Math.min(1, dt * 10);
    this.pontos.visible = this.opacidade > 0.02;
    if (!this.pontos.visible || !de || !para) return;

    this.material.opacity = this.opacidade * 0.85;
    const pos = this.geometria.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < RastroDeIsca.PASSOS; i++) {
      // Os pontos CORREM da isca para o bicho: a direção do movimento é o que
      // diz quem está chamando quem.
      const t = ((i / RastroDeIsca.PASSOS + this.tempo * 0.55) % 1);
      pos.setXYZ(
        i,
        de.x + (para.x - de.x) * t,
        de.y + (para.y - de.y) * t + Math.sin(t * Math.PI) * 0.09,
        de.z + (para.z - de.z) * t,
      );
    }
    pos.needsUpdate = true;
  }

  descartar() {
    this.geometria.dispose();
    this.material.dispose();
  }
}
