import { readdirSync } from 'node:fs'
import { Hono } from 'hono'
import { join, extname, parse as pathParse, basename } from 'node:path'
import { readFileSync } from 'node:fs'
import { renderer } from './renderer'
import { marked } from 'marked'

const app = new Hono()

app.get('*', renderer)

/**
 * Recursively reads files and executes `addRoute()` for each markdown file
 * @param {string} dirPath - The file path to the directory to start reading files from
 * @param {string} basePath - base url directory to mount ( Don't put`/` at the end. )
 */
const readFiles = (dirPath: string, basePath: string = '') => {
  console.debug(`Reading dir: ${dirPath}`)
  const children = readdirSync(dirPath, { withFileTypes: true })

  for (const child of children) {
    if (child.isDirectory()) {
      const childDirPath = join(dirPath, child.name)
      readFiles(childDirPath, join(basePath, basename(childDirPath)))
    } else if (child.isFile() && extname(child.name) === '.md') {
      const filePath = join(dirPath, child.name)
      console.debug(`Reading file: ${filePath}`)
      addRoute(filePath, basePath)
    }
  }
}

/**
 * Adds a route to the app that serves the markdown file from the specified path
 * @param {string} filePath - The full path of markdown file
 * @param {string} basePath - base url directory to mount ( Don't put`/` at the end. )
 */
const addRoute = async (filePath: string, basePath: string) => {
  const routeName =
    pathParse(filePath).name !== 'index' ? pathParse(filePath).name : ''
  console.debug(`Adding route: ${filePath} as ${basePath}/${routeName}`)
  const rawMarkdown = readFileSync(filePath, { encoding: 'utf-8' })
  const renderedMarkdown = await renderMarkdown(rawMarkdown)
  app.get(`${basePath}/${routeName}`, (c) => {
    return c.render(renderedMarkdown.renderedMarkdown, {
      title: renderedMarkdown.title
    })
  })
}

type ExtractFrontMatterResult = {
  frontMatter: { [key: string]: string }
  content: string
}

/**
 * A very tiny front matter extractor, an alternative to `gray-matter`
 * @param {string} rawMarkdown - The raw markdown text
 */
const extractFrontMatter = (rawMarkdown: string): ExtractFrontMatterResult => {
  const regex = /^---$\n[\s\S]*?\n^---$/gm
  const match = rawMarkdown.match(regex)

  const frontMatter: { [key: string]: string } = {}
  let content = rawMarkdown

  if (match) {
    const frontMatterText = match[0]
    content = rawMarkdown.replace(frontMatterText, '').trim()
    const frontMatterContent = frontMatterText
      .replace(/^---$|---$/gm, '')
      .trim()
    const keyValueRegex = /(\w*): ?(.*)/
    frontMatterContent.split('\n').forEach((line) => {
      const match = line.match(keyValueRegex)
      if (match) {
        let [_, key, value] = match
        value.replace(/^["']|["']$/g, '')
        frontMatter[key] = value
      }
    })
  }

  return { frontMatter, content }
}

const renderMarkdown = async (rawMarkdown: string) => {
  const frontMatterParsedRawMarkdown = extractFrontMatter(rawMarkdown) as {
    frontMatter: {
      title: string
      titleTemplate?: string
    }
  } & ExtractFrontMatterResult
  const rawHtml = await marked(frontMatterParsedRawMarkdown.content)
  const renderedMarkdown = (
    <main dangerouslySetInnerHTML={{ __html: rawHtml }} />
  )

  const title = frontMatterParsedRawMarkdown.frontMatter.title
  return { renderedMarkdown, title }
}

const main = () => {
  readFiles('./docs')
}

main()

export default app
