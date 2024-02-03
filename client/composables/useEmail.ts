import pretty from 'pretty'
import type { Result } from '@vue-email/compiler'
import type { Email, Template } from '@/types/email'

export function useEmail() {
  const emails = useState<Email[]>('emails')
  const email = useState<Email>('email')
  const sending = useState<boolean>('sending', () => false)
  const refresh = useState<boolean>('refresh', () => false)
  const template = useState<Template>('template')

  const { host } = useWindow()

  const getEmails = async () => {
    const { data, error } = await useFetch<Email[]>('/api/emails', {
      baseURL: host.value,
    })

    if (error && error.value) {
      console.error(error)
      return
    }

    if (data && data.value)
      emails.value = data.value
  }

  const renderEmail = async (props?: Email['props']) => {
    if (!email.value)
      return null

    const { data } = await useFetch<Result>(`/api/render/${email.value.filename}`, {
      method: 'POST',
      baseURL: host.value,
      body: {
        props,
      },
    })

    if (data.value) {
      template.value = {
        vue: email.value.content,
        html: pretty(data.value.html),
        txt: data.value.text,
      } as Template
    }
  }

  const getEmail = async (filename: string) => {
    if (filename && emails.value && emails.value.length) {
      const found = emails.value.find(email => email.filename === filename)

      if (found) {
        email.value = found

        await renderEmail()
      }
    }
  }

  const sendTestEmail = async (to: string, subject: string, markup: string) => {
    try {
      if (!email || !subject)
        return

      sending.value = true

      const response = await fetch('https://react.email/api/send/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html: markup,
        }),
      })

      if (response.status === 429) {
        const { error } = await response.json()

        useToast().add({
          title: 'Too many requests',
          description: error,
          color: 'red',
          icon: 'i-ph-bell-bold',
        })
      }

      if (response.status === 200) {
        useToast().add({
          title: 'Success',
          description: 'Email sent successfully.',
          color: 'green',
          icon: 'i-ph-bell-bold',
        })
      }
    }
    catch (error) {
      useToast().add({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        color: 'red',
        icon: 'i-ph-bell-bold',
      })
    }
    finally {
      sending.value = false
    }
  }

  return {
    email,
    emails,
    sending,
    refresh,
    template,
    getEmail,
    sendTestEmail,
    renderEmail,
    getEmails,
  }
}
