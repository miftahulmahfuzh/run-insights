import { describe, expect, it } from 'vitest'

import {
  fieldErrorsOf,
  profileFormSchema,
  profileWriteSchema,
  toProfileWrite,
} from '@/lib/profile/schema'

const TODAY = new Date('2026-08-20T05:12:00+07:00')

/** What a real `<form>` submission looks like: strings, and `''` for anything left blank. */
const form = (over: Record<string, string> = {}) => ({
  age: '',
  heightCm: '',
  weightKg: '',
  restingHr: '',
  maxHr: '',
  ...over,
})

describe('profileFormSchema', () => {
  it('accepts an entirely empty form — skipping is the normal path, not a special one', () => {
    const parsed = profileFormSchema.safeParse(form())
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({})
  })

  it('coerces the strings a form actually sends', () => {
    const parsed = profileFormSchema.parse(
      form({ age: '30', heightCm: '170', weightKg: '55.0', restingHr: '72', maxHr: '189' }),
    )
    expect(parsed).toEqual({ age: 30, heightCm: 170, weightKg: 55, restingHr: 72, maxHr: 189 })
  })

  it('ignores React’s $ACTION_ keys, which Object.fromEntries(formData) always includes', () => {
    const parsed = profileFormSchema.parse({ ...form({ age: '30' }), $ACTION_ID_abc: '1' })
    expect(parsed).toEqual({ age: 30 })
  })

  it('rounds weight to the one decimal numeric(4,1) can hold, rather than rejecting it', () => {
    // Someone who types 55.55 means 55.6, not "please show me an error" — and Postgres would round
    // it anyway. Validating at the column's precision keeps the two in step.
    expect(profileFormSchema.parse(form({ weightKg: '55.55' })).weightKg).toBe(55.6)
    expect(profileFormSchema.parse(form({ weightKg: '55.44' })).weightKg).toBe(55.4)
  })

  it('rejects out-of-range values on every field', () => {
    expect(profileFormSchema.safeParse(form({ age: '9' })).success).toBe(false)
    expect(profileFormSchema.safeParse(form({ age: '101' })).success).toBe(false)
    expect(profileFormSchema.safeParse(form({ heightCm: '99' })).success).toBe(false)
    expect(profileFormSchema.safeParse(form({ weightKg: '19' })).success).toBe(false)
    expect(profileFormSchema.safeParse(form({ restingHr: '29' })).success).toBe(false)
    expect(profileFormSchema.safeParse(form({ maxHr: '99' })).success).toBe(false)
  })

  it('catches the fat-fingered max HR without second-guessing a real one', () => {
    // 230 is deliberately generous: a lab test on a young athlete can genuinely reach the low 200s.
    // The bound exists to catch "1890", not to argue with a measurement.
    expect(profileFormSchema.safeParse(form({ maxHr: '205' })).success).toBe(true)
    expect(profileFormSchema.safeParse(form({ maxHr: '1890' })).success).toBe(false)
  })

  it('rejects a resting HR at or above the measured max', () => {
    expect(profileFormSchema.safeParse(form({ restingHr: '72', maxHr: '189' })).success).toBe(true)
    expect(profileFormSchema.safeParse(form({ restingHr: '119', maxHr: '110' })).success).toBe(
      false,
    )
  })

  it('does not apply the cross-field check when only one of the two is present', () => {
    expect(profileFormSchema.safeParse(form({ restingHr: '119' })).success).toBe(true)
    expect(profileFormSchema.safeParse(form({ maxHr: '110' })).success).toBe(true)
  })
})

describe('toProfileWrite', () => {
  it('converts age to birth year, once, at the boundary', () => {
    expect(toProfileWrite({ age: 30 }, TODAY).birthYear).toBe(1996)
    expect(toProfileWrite({ age: 20 }, TODAY).birthYear).toBe(2006)
    expect(toProfileWrite({ age: 60 }, TODAY).birthYear).toBe(1966)
  })

  it('maps an empty form to all-null, so clearing a field on /me actually clears the column', () => {
    expect(toProfileWrite({}, TODAY)).toEqual({
      birthYear: null,
      heightCm: null,
      weightKg: null,
      restingHr: null,
      maxHr: null,
    })
  })

  it('produces a shape profileWriteSchema accepts', () => {
    const write = toProfileWrite(
      profileFormSchema.parse(
        form({ age: '30', heightCm: '170', weightKg: '55.0', restingHr: '72', maxHr: '189' }),
      ),
      TODAY,
    )
    expect(profileWriteSchema.safeParse(write).success).toBe(true)
    expect(write).toEqual({
      birthYear: 1996,
      heightCm: 170,
      weightKg: 55,
      restingHr: 72,
      maxHr: 189,
    })
  })
})

describe('fieldErrorsOf', () => {
  it('keys the first message per field, which is what <Field error> renders', () => {
    const parsed = profileFormSchema.safeParse(form({ age: '9', maxHr: '1890' }))
    expect(parsed.success).toBe(false)
    const errors = fieldErrorsOf(parsed.error!)
    expect(Object.keys(errors).sort()).toEqual(['age', 'maxHr'])
  })
})
