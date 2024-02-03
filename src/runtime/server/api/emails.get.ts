import path from 'node:path'
import { kebabCase, pascalCase, upperFirst } from 'scule'
import { createComponentMetaCheckerByJsonConfig } from 'vue-component-meta'
import { destr } from 'destr'
import JSON5 from 'json5'
import type { Email } from '../../types/email'
import { createError, defineEventHandler, useStorage } from '#imports'

const rootDir = process.cwd()
const checker = createComponentMetaCheckerByJsonConfig(
  rootDir,
  {
    extends: `${rootDir}/tsconfig.json`,
    skipLibCheck: true,
    include: ['emails/**/*'],
    exclude: [],
  },
  {
    forceUseTs: true,
    printer: { newLine: 1 },
  },
)

function stripeTypeScriptInternalTypesSchema(type: any): any {
  if (!type)
    return type

  if (type.declarations && type.declarations.find((d: any) => d.file.includes('node_modules/typescript')))
    return false

  if (Array.isArray(type))
    return type.map((sch: any) => stripeTypeScriptInternalTypesSchema(sch)).filter(r => r !== false)

  if (Array.isArray(type.schema)) {
    return {
      ...type,
      schema: type.schema.map((sch: any) => stripeTypeScriptInternalTypesSchema(sch)).filter((r: any) => r !== false),
    }
  }
  if (!type.schema || typeof type.schema !== 'object')
    return type

  const schema: any = {}
  Object.keys(type.schema).forEach((sch) => {
    const res = stripeTypeScriptInternalTypesSchema(type.schema[sch])
    if (res !== false)
      schema[sch] = res
  })
  return {
    ...type,
    schema,
  }
}

export default defineEventHandler(async () => {
  try {
    const nitroEmails = await useStorage('assets:emails').getKeys()

    const emails: Email[] = await Promise.all(
      nitroEmails.map(async (email) => {
        const data = JSON.stringify(
          await useStorage('assets:emails').getMeta(email),
        )
        const emailData = JSON.parse(data)
        const emailPath = path.join(
          rootDir,
          'emails',
          email.replaceAll(':', '/'),
        )
        const { props } = checker.getComponentMeta(emailPath)
        let emailProps = (props).filter(prop => !prop.global).sort((a, b) => {
          if (!a.required && b.required)
            return 1

          if (a.required && !b.required)
            return -1

          if (a.type === 'boolean' && b.type !== 'boolean')
            return 1

          if (a.type !== 'boolean' && b.type === 'boolean')
            return -1

          return 0
        })
        emailProps = emailProps.map(stripeTypeScriptInternalTypesSchema)
        const destructuredProps = emailProps.map((prop) => {
          const destructuredType = prop.type.split('|').map((type) => {
            type = type.trim()
            const value = prop.default

            if (type === 'string') {
              return {
                type: 'string',
                value: destr(value) ?? '',
              }
            }

            if (type === 'number') {
              return {
                type: 'number',
                value: destr(value) || 0,
              }
            }

            if (type === 'boolean') {
              return {
                type: 'boolean',
                value: destr(value) || false,
              }
            }

            if (type === 'object' || type.includes('Record') || type.includes('Record<')) {
              return {
                type: 'object',
                value: value ? JSON5.parse(value) : {},
              }
            }

            if (type === 'array' || type.includes('[]') || type.includes('Array') || type.includes('Array<')) {
              return {
                type: 'array',
                value: value ? JSON5.parse(value) : [],
              }
            }

            return {
              type: 'string',
              value: value ?? '',
            }
          })

          return {
            label: prop.name,
            type: destructuredType[0].type,
            value: destructuredType[0].value,
          }
        })

        const content = (await useStorage('assets:emails').getItem(
          email,
        )) as string

        return {
          label: pascalCase(
            kebabCase(email.replace('.vue', '').replace(':', '_'))
              .split('-')
              .join(' '),
          ),
          filename: email,
          content,
          icon: 'i-heroicons-envelope',
          size: emailData.size,
          created: emailData.birthtime,
          modified: emailData.mtime,
          props: destructuredProps,
        }
      }),
    )

    if (!emails || !emails.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
      })
    }

    return emails
  }
  catch (error) {
    console.error(error)

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    })
  }
})
