import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { configureTeacherCards } from './teacher-materials'

describe('teacher hair-card materials', () => {
  it.each(['Eyebrows_M_Natural_CardsMesh_Group0_LOD0_CardMat', 'SKM_Teacher_FaceMesh.001_LashMat', 'MI_Eyelashes'])('uses soft strand coverage for %s', name => {
    const material = new THREE.MeshStandardMaterial({ name })
    configureTeacherCards(material)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.alphaTest).toBe(.005)
    expect(material.alphaHash).toBe(false)
    expect(material.side).toBe(THREE.DoubleSide)
  })
  it('keeps head-hair depth masking and leaves unrelated face materials unchanged', () => {
    const hair = new THREE.MeshStandardMaterial({ name: 'Hair_S_Casual_CardMat' })
    configureTeacherCards(hair)
    expect(hair.transparent).toBe(false)
    expect(hair.depthWrite).toBe(true)
    expect(hair.alphaTest).toBe(.12)
    const skin = new THREE.MeshStandardMaterial({ name: 'MI_Face_Skin' })
    const before = skin.toJSON()
    configureTeacherCards(skin)
    expect(skin.toJSON()).toEqual(before)
  })
})
