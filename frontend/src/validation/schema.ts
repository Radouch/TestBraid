import Ajv2020 from 'ajv/dist/2020'
import type { ErrorObject, ValidateFunction } from 'ajv'
import testSchema from '../../../schemas/test.schema.json'
import groupSchema from '../../../schemas/group.schema.json'
import mediaSchema from '../../../schemas/media.schema.json'
import blockSchema from '../../../schemas/content-block.schema.json'
import choiceSchema from '../../../schemas/choice-question.schema.json'
import matchingSchema from '../../../schemas/matching-question.schema.json'

export type DocumentKind = 'test' | 'group' | 'media'

export interface ValidationIssue {
  path: string
  code: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

// Draft 2020-12 must be selected explicitly: Ajv's default class uses draft-07.
// Register local schemas, so neither browser nor server fetches schema IDs online.
const ajv = new Ajv2020({ allErrors: true, strict: true })
for (const schema of [
  blockSchema,
  choiceSchema,
  matchingSchema,
  testSchema,
  groupSchema,
  mediaSchema,
]) {
  ajv.addSchema(schema)
}

const ids: Record<DocumentKind, string> = {
  test: testSchema.$id,
  group: groupSchema.$id,
  media: mediaSchema.$id,
}

const validators: Record<DocumentKind, ValidateFunction> = {
  test: requiredValidator(ids.test),
  group: requiredValidator(ids.group),
  media: requiredValidator(ids.media),
}

function requiredValidator(id: string): ValidateFunction {
  const validator = ajv.getSchema(id)
  if (!validator) throw new Error(`Missing TestBraid schema: ${id}`)
  return validator
}

/** Validate persisted JSON structure, including schemaVersion, without checking publish readiness. */
export function validateDocument(kind: DocumentKind, value: unknown): ValidationResult {
  const validator = validators[kind]
  const valid = validator(value)
  return {
    valid,
    issues: valid ? [] : (validator.errors ?? []).map((err: ErrorObject): ValidationIssue => ({
      path: err.instancePath || '/',
      code: err.keyword.toUpperCase(),
      message: err.message ?? 'Invalid document structure',
    })),
  }
}
