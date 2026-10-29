import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { configureTeacherCards } from './teacher-materials'

type FaceMesh = THREE.Mesh & {
  morphTargetDictionary: Record<string, number>
  morphTargetInfluences: number[]
}

const canonical = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')

export class TeacherScene {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20)
  private readonly renderer: THREE.WebGLRenderer
  private readonly observer: ResizeObserver
  private readonly abort = new AbortController()
  private readonly targets = new Map<string, number>()
  private readonly meshes: FaceMesh[] = []
  private readonly lookAt = new THREE.Vector3(0, 1.56, 0)
  private readonly front = new THREE.Vector3(0, 0, 1)
  private environment: THREE.WebGLRenderTarget
  private model: THREE.Group | null = null
  private disposed = false
  private frame = 0
  private previous = 0
  private elapsed = 0
  private nextBlink = 4.2
  private blinkStarted = -10
  private blinkEnabled = true

  constructor(private readonly host: HTMLElement, private readonly onError: (error: Error) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y'
    this.renderer.domElement.setAttribute('aria-label', 'Трёхмерный преподаватель')
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost)
    host.append(this.renderer.domElement)
    this.scene.background = new THREE.Color('#e6ebee')
    const room = new RoomEnvironment()
    const generator = new THREE.PMREMGenerator(this.renderer)
    this.environment = generator.fromScene(room, 0.04)
    this.scene.environment = this.environment.texture
    this.scene.environmentIntensity = 0.65
    room.dispose()
    generator.dispose()
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x777c86, 1.4))
    const key = new THREE.DirectionalLight(0xfff5e9, 2.8)
    key.position.set(-1, 2.3, 2)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xdceaff, 1)
    fill.position.set(1, 1.8, 1)
    this.scene.add(fill)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.resize()
  }

  async load(modelUrl: string): Promise<void> {
    const url = new URL(modelUrl, window.location.href)
    if (url.origin !== window.location.origin) throw new Error('Модель должна загружаться с сервера платформы.')
    const response = await fetch(url, { credentials: 'same-origin', signal: this.abort.signal })
    if (!response.ok) throw new Error('Не удалось загрузить модель преподавателя.')
    if (Number(response.headers.get('Content-Length')) > 15 * 1024 * 1024) throw new Error('Файл модели превышает допустимый размер.')
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('Файл модели превышает допустимый размер.')
    if (this.disposed) return
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.parseAsync(bytes, new URL('.', url).href)
    if (this.disposed) { this.disposeModel(gltf.scene); return }
    this.model = gltf.scene
    this.scene.add(gltf.scene)
    const faceBounds = new THREE.Box3()
    gltf.scene.updateMatrixWorld(true)
    let nose: THREE.Object3D | undefined
    gltf.scene.traverse(object => {
      if (!nose && /facial_c_nose(?:tip|bridge|root)?(?:_\d+)?$/i.test(object.name)) nose = object
      if (!(object instanceof THREE.Mesh)) return
      if (/facemesh/i.test(object.name)) faceBounds.union(new THREE.Box3().setFromObject(object, true))
      if (object.morphTargetDictionary && object.morphTargetInfluences) this.meshes.push(object as FaceMesh)
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial && /DefaultGarment.*Shirt/.test(material.name)) {
          material.color.set('#465983')
        }
        if (material instanceof THREE.MeshStandardMaterial && /^MI_Eye[LR]_Baked/.test(material.name)) {
          material.envMapIntensity = 0.25
          material.roughness = 0.2
          // MetaHuman's procedural pupil is absent from the exported base-color texture.
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
              #include <map_fragment>
              #ifdef USE_MAP
                float pupil = smoothstep(0.055, 0.060, length(vMapUv - vec2(0.5)));
                diffuseColor.rgb = mix(vec3(0.003), diffuseColor.rgb, pupil);
              #endif
            `)
          }
          material.customProgramCacheKey = () => 'eduai-metahuman-eye-pupil-v1'
          material.needsUpdate = true
        }
        if (material instanceof THREE.MeshStandardMaterial) configureTeacherCards(material)
      }
    })
    if (!this.meshes.some(mesh => Object.keys(mesh.morphTargetDictionary).some(name => canonical(name) === 'jawopen'))) {
      throw new Error('В модели отсутствует лицевая анимация.')
    }
    if (faceBounds.isEmpty()) throw new Error('Не удалось определить положение головы.')
    faceBounds.getCenter(this.lookAt)
    this.lookAt.y = faceBounds.max.y - 0.15
    if (nose) {
      const direction = nose.getWorldPosition(new THREE.Vector3()).sub(this.lookAt)
      direction.y = 0
      if (direction.length() > 0.015) this.front.copy(direction.normalize())
    }
    this.resize()
    await this.renderer.compileAsync(this.scene, this.camera)
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.render)
  }

  setFace(weights: Record<string, number>): void {
    this.targets.clear()
    for (const [name, weight] of Object.entries(weights)) {
      if (Number.isFinite(weight)) this.targets.set(canonical(name), THREE.MathUtils.clamp(weight, 0, 1))
    }
  }

  setBlink(enabled: boolean): void { this.blinkEnabled = enabled }
  reset(): void { this.targets.clear() }

  inspect() {
    return {
      loaded: !!this.model,
      morphNames: [...new Set(this.meshes.flatMap(mesh => Object.keys(mesh.morphTargetDictionary)))],
      meshes: this.meshes.length,
      lookAt: this.lookAt.toArray(),
      front: this.front.toArray(),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      programs: this.renderer.info.programs?.length,
      weights: Object.fromEntries(this.targets),
    }
  }

  private readonly render = (time: number) => {
    if (this.disposed) return
    const delta = this.previous ? Math.min((time - this.previous) / 1000, 0.1) : 1 / 60
    this.previous = time
    this.elapsed += delta
    if (this.elapsed >= this.nextBlink) {
      this.blinkStarted = this.elapsed
      this.nextBlink = this.elapsed + 3.6 + Math.random() * 2.4
    }
    const phase = (this.elapsed - this.blinkStarted) / 0.18
    const blink = this.blinkEnabled && phase >= 0 && phase <= 1 ? Math.sin(phase * Math.PI) ** 2 : 0
    for (const mesh of this.meshes) {
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        const key = canonical(name)
        let target = this.targets.get(key) ?? 0
        if (key === 'eyeblinkleft' || key === 'eyeblinkright') target = Math.max(target, blink)
        const current = mesh.morphTargetInfluences[index]
        const tau = key.startsWith('eyeblink') ? 0.012 : target > current ? 0.035 : 0.08
        mesh.morphTargetInfluences[index] = current + (target - current) * (1 - Math.exp(-delta / tau))
      }
    }
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.render)
  }

  private resize(): void {
    if (this.disposed) return
    const width = Math.max(this.host.clientWidth, 1)
    const height = Math.max(this.host.clientHeight, 1)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    const span = Math.max(0.40, 0.48 / this.camera.aspect)
    const distance = span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))
    this.camera.position.copy(this.lookAt).addScaledVector(this.front, distance)
    this.camera.position.y += 0.055
    this.camera.lookAt(this.lookAt)
    this.camera.updateProjectionMatrix()
  }

  private readonly contextLost = (event: Event) => {
    event.preventDefault()
    cancelAnimationFrame(this.frame)
    this.onError(new Error('Графический контекст потерян. Перезагрузите тьютора.'))
  }

  private disposeModel(model: THREE.Object3D): void {
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()
    const skeletons = new Set<THREE.Skeleton>()
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    })
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
      material.dispose()
    }
    for (const texture of textures) texture.dispose()
    for (const skeleton of skeletons) skeleton.dispose()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.abort.abort()
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost)
    if (this.model) this.disposeModel(this.model)
    this.environment.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}
