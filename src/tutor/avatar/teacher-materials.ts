import * as THREE from 'three'

export function configureTeacherCards(material: THREE.MeshStandardMaterial): void {
  const fine = /eyebrows|eyelashes|lashmat/i.test(material.name)
  if (!fine && !/hair/i.test(material.name)) return
  material.side = THREE.DoubleSide
  material.alphaHash = false
  material.alphaToCoverage = false
  material.alphaTest = fine ? .005 : .12
  material.transparent = fine
  material.depthWrite = !fine
  material.forceSinglePass = true
  material.needsUpdate = true
}
