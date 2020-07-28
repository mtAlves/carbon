// Theirs
import React, { useContext, useState, useEffect } from 'react'
import domtoimage from 'dom-to-image'
import Dropzone from 'dropperx'
import debounce from 'lodash.debounce'
import dynamic from 'next/dynamic'

// Ours
import ApiContext from './ApiContext'
import Dropdown from './Dropdown'
import Settings from './Settings'
import Toolbar from './Toolbar'
import Overlay from './Overlay'
import BackgroundSelect from './BackgroundSelect'
import Carbon from './Carbon'
import ExportMenu from './ExportMenu'
import CopyMenu from './CopyMenu'
import Themes from './Themes'
import TweetButton from './TweetButton'
import FontFace from './FontFace'
import LanguageIcon from './svg/Language'
import {
  LANGUAGES,
  LANGUAGE_MIME_HASH,
  LANGUAGE_MODE_HASH,
  LANGUAGE_NAME_HASH,
  DEFAULT_EXPORT_SIZE,
  COLORS,
  EXPORT_SIZES_HASH,
  DEFAULT_CODE,
  DEFAULT_SETTINGS,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  FONTS,
} from '../lib/constants'
import { serializeState, getRouteState } from '../lib/routing'
import { getSettings, unescapeHtml, formatCode, omit } from '../lib/util'

const languageIcon = <LanguageIcon />

const SnippetToolbar = dynamic(() => import('./SnippetToolbar'), {
  loading: () => null,
})

const getConfig = omit(['code'])
const unsplashPhotographerCredit = /\n\n\/\/ Photo by.+?on Unsplash/

const Editor = (props) => {
  const context = useContext(ApiContext)
  const [state, setState] = useState({ loading: true })
  const [isSafari, setIsSafari] = useState(false)
  const [isFirefox, setIsFirefox] = useState(false)

  useEffect(() => {
    const { queryState } = getRouteState(props.router)
    const newState = {
      ...DEFAULT_SETTINGS,
      // IDEA: we could create an interface for loading this config, so that it looks identical
      // whether config is loaded from localStorage, gist, or even something like IndexDB
      // Load options from gist or localStorage
      ...(props.snippet ? props.snippet : getSettings(localStorage)),
      // and then URL params
      ...queryState,
      codeSnapshots: [],
      loading: false,
    }
  
    // Makes sure the slash in 'application/X' is decoded
    if (newState.language) {
      newState.language = unescapeHtml(newState.language)
    }
  
    if (newState.fontFamily && !FONTS.find(({ id }) => id === newState.fontFamily)) {
      newState.fontFamily = DEFAULT_SETTINGS.fontFamily
    }
    setState({...state, ...newState})
  
    setIsSafari(
      window.navigator &&
      window.navigator.userAgent.indexOf('Safari') !== -1 &&
      window.navigator.userAgent.indexOf('Chrome') === -1
    )
    setIsFirefox(
      window.navigator &&
      window.navigator.userAgent.indexOf('Firefox') !== -1 &&
      window.navigator.userAgent.indexOf('Chrome') === -1
    )
   }, [])
  
  const carbonNode = React.createRef()

  const getTheme = () => props.themes.find(t => t.id === state.theme) || DEFAULT_THEME

  const onUpdate = debounce(updates => props.onUpdate(updates), 750, {
    trailing: true,
    leading: true,
  })

  const updateState = updates => setState(updates, () => onUpdate(state))

  const updateCode = code => updateState({
    code,
    codeSnapshots: [...state.codeSnapshots, code]
  })
  const updateWidth = width => setState({ widthAdjustment: false, width })

  const getCarbonImage = async (
    {
      format,
      type,
      squared = state.squaredImage,
      exportSize = (EXPORT_SIZES_HASH[state.exportSize] || DEFAULT_EXPORT_SIZE).value,
      includeTransparentRow = false,
    } = { format: 'png' }
  ) => {
    // if safari, get image from api
    const isPNG = format !== 'svg'
    if (context.image && isSafari && isPNG) {
      const themeConfig = getTheme()
      // pull from custom theme highlights, or state highlights
      const encodedState = serializeState({
        ...state,
        highlights: { ...themeConfig.highlights, ...state.highlights },
      })
      return context.image(encodedState)
    }

    const node = carbonNode.current

    const map = new Map()
    const undoMap = value => {
      map.forEach((value, node) => (node.innerHTML = value))
      return value
    }

    if (isPNG) {
      node.querySelectorAll('span[role="presentation"]').forEach(node => {
        if (node.innerText && node.innerText.match(/%[A-Fa-f0-9]{2}/)) {
          map.set(node, node.innerHTML)
          node.innerText.match(/%[A-Fa-f0-9]{2}/g).forEach(t => {
            node.innerText = node.innerText.replace(t, encodeURIComponent(t))
          })
        }
      })
    }

    const width = node.offsetWidth * exportSize
    const height = squared ? node.offsetWidth * exportSize : node.offsetHeight * exportSize

    const config = {
      style: {
        transform: `scale(${exportSize})`,
        'transform-origin': 'center',
        background: squared ? state.backgroundColor : 'none',
      },
      filter: n => {
        if (n.className) {
          const className = String(n.className)
          if (className.includes('eliminateOnRender')) {
            return false
          }
          if (className.includes('CodeMirror-cursors')) {
            return false
          }
          if (className.includes('twitter-png-fix')) {
            return includeTransparentRow
          }
        }
        return true
      },
      width,
      height,
    }

    // current font-family used
    const fontFamily = state.fontFamily
    try {
      // TODO consolidate type/format to only use one param
      if (type === 'objectURL') {
        if (format === 'svg') {
          return (
            domtoimage
              .toSvg(node, config)
              .then(dataUrl =>
                dataUrl
                  .replace(/&nbsp;/g, '&#160;')
                  // https://github.com/tsayen/dom-to-image/blob/fae625bce0970b3a039671ea7f338d05ecb3d0e8/src/dom-to-image.js#L551
                  .replace(/%23/g, '#')
                  .replace(/%0A/g, '\n')
                  // remove other fonts which are not used
                  .replace(
                    new RegExp('@font-face\\s+{\\s+font-family: (?!"*' + fontFamily + ').*?}', 'g'),
                    ''
                  )
              )
              // https://stackoverflow.com/questions/7604436/xmlparseentityref-no-name-warnings-while-loading-xml-into-a-php-file
              .then(dataUrl => dataUrl.replace(/&(?!#?[a-z0-9]+;)/g, '&amp;'))
              .then(uri => uri.slice(uri.indexOf(',') + 1))
              .then(data => new Blob([data], { type: 'image/svg+xml' }))
              .then(data => window.URL.createObjectURL(data))
          )
        }

        return await domtoimage.toBlob(node, config).then(blob => window.URL.createObjectURL(blob))
      }

      if (type === 'blob') {
        return await domtoimage.toBlob(node, config)
      }

      // Twitter needs regular dataurls
      return await domtoimage.toPng(node, config)
    } finally {
      undoMap()
    }
  }

  const tweet = () => {
    getCarbonImage({ format: 'png', includeTransparentRow: true }).then(
      context.tweet.bind(null, state.code || DEFAULT_CODE)
    )
  }

  const exportImage = (format = 'png', options = {}) => {
    const link = document.createElement('a')

    const prefix = options.filename || state.name || 'carbon'

    return getCarbonImage({ format, type: 'objectURL' }).then(url => {
      if (format !== 'open') {
        link.download = `${prefix}.${format}`
      }
      if (isFirefox) {
        link.target = '_blank'
      }
      link.href = url
      document.body.appendChild(link)
      link.click()
      link.remove()
    })
  }

  const copyImage = () =>
    getCarbonImage({ format: 'png', type: 'blob' }).then(blob =>
      navigator.clipboard.write([
        new window.ClipboardItem({
          'image/png': blob,
        }),
      ])
    )

  const updateSetting = (key, value) => {
    updateState({ [key]: value })
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
      updateState({ preset: null })
    }
  }

  const resetDefaultSettings = () => {
    updateState(DEFAULT_SETTINGS)
    props.onReset()
  }

  const onDrop = ([file]) => {
    if (file.type.split('/')[0] === 'image') {
      updateState({
        backgroundImage: file.content,
        backgroundImageSelection: null,
        backgroundMode: 'image',
        preset: null,
      })
    } else {
      updateState({ code: file.content, language: 'auto' })
    }
  }

  const updateLanguage = language => {
    if (language) {
      updateSetting('language', language.mime || language.mode)
    }
  }

  const updateBackground = ({ photographer, ...changes } = {}) => {
    if (photographer) {
      updateState(({ code = DEFAULT_CODE }) => ({
        ...changes,
        code:
          code.replace(unsplashPhotographerCredit, '') +
          `\n\n// Photo by ${photographer.name} on Unsplash`,
        preset: null,
      }))
    } else {
      updateState({ ...changes, preset: null })
    }
  }

  const updateTheme = theme => updateState({ theme })
  const updateHighlights = updates =>
    setState(({ highlights = {} }) => ({
      highlights: {
        ...highlights,
        ...updates,
      },
    }))

  const createTheme = theme => {
    props.updateThemes(themes => [theme, ...themes])
    updateTheme(theme.id)
  }

  const removeTheme = id => {
    props.updateThemes(themes => themes.filter(t => t.id !== id))
    if (state.theme.id === id) {
      updateTheme(DEFAULT_THEME.id)
    }
  }

  const applyPreset = ({ id: preset, ...settings }) => updateState({ preset, ...settings })

  const format = () =>
    formatCode(state.code)
      .then(updateCode)
      .catch(() => {
        // create toast here in the future
      })

  const handleSnippetCreate = () =>
    context.snippet
      .create(state)
      .then(data => props.setSnippet(data))
      .then(() =>
        props.setToasts({
          type: 'SET',
          toasts: [{ children: 'Snippet duplicated!', timeout: 3000 }],
        })
      )

  const handleSnippetDelete = () =>
    context.snippet
      .delete(props.snippet.id)
      .then(() => props.setSnippet(null))
      .then(() =>
        props.setToasts({
          type: 'SET',
          toasts: [{ children: 'Snippet deleted', timeout: 3000 }],
        })
      )

    const {
      highlights,
      language,
      backgroundColor,
      backgroundImage,
      backgroundMode,
      code,
      exportSize
    } = state

    const config = getConfig(state)

    const theme = getTheme()

    return (
      <div className="editor">
        <Toolbar>
          <Themes
            theme={theme}
            highlights={highlights}
            update={updateTheme}
            updateHighlights={updateHighlights}
            remove={removeTheme}
            create={createTheme}
            themes={props.themes}
          />
          <Dropdown
            title="Language"
            icon={languageIcon}
            selected={
              LANGUAGE_NAME_HASH[language] ||
              LANGUAGE_MIME_HASH[language] ||
              LANGUAGE_MODE_HASH[language] ||
              LANGUAGE_MODE_HASH[DEFAULT_LANGUAGE]
            }
            list={LANGUAGES}
            onChange={updateLanguage}
          />
          <div className="toolbar-second-row">
            <BackgroundSelect
              onChange={updateBackground}
              updateHighlights={updateHighlights}
              mode={backgroundMode}
              color={backgroundColor}
              image={backgroundImage}
              carbonRef={carbonNode.current}
            />
            <Settings
              {...config}
              onChange={updateSetting}
              resetDefaultSettings={resetDefaultSettings}
              format={format}
              applyPreset={applyPreset}
              getCarbonImage={getCarbonImage}
            />
            <div id="style-editor-button" />
            <div className="buttons">
              <CopyMenu copyImage={copyImage} carbonRef={carbonNode.current} />
              <TweetButton onClick={tweet} />
              <ExportMenu
                onChange={updateSetting}
                exportImage={exportImage}
                exportSize={exportSize}
                backgroundImage={backgroundImage}
              />
            </div>
          </div>
        </Toolbar>
        <Dropzone accept="image/*, text/*, application/*" onDrop={onDrop}>
          {({ canDrop }) => (
            <Overlay
              isOver={canDrop}
              title={`Drop your file here to import ${canDrop ? '✋' : '✊'}`}
            >
              {/*key ensures Carbon's internal language state is updated when it's changed by Dropdown*/}
              <Carbon
                key={language}
                ref={carbonNode}
                config={state}
                onChange={updateCode}
                updateWidth={updateWidth}
                loading={state.loading}
                theme={theme}
              >
                {code != null ? code : DEFAULT_CODE}
              </Carbon>
            </Overlay>
          )}
        </Dropzone>
        {props.snippet && (
          <SnippetToolbar
            snippet={props.snippet}
            onCreate={handleSnippetCreate}
            onDelete={handleSnippetDelete}
            name={config.name}
            onChange={updateSetting}
          />
        )}
        <FontFace {...config} />
        <style jsx>
          {`
            .editor {
              background: ${COLORS.BLACK};
              border: 3px solid ${COLORS.SECONDARY};
              border-radius: 8px;
              padding: 16px;
            }

            .buttons {
              display: flex;
              margin-left: auto;
            }
            .toolbar-second-row {
              height: 40px;
              display: flex;
              flex: 1 1 auto;
            }
            .toolbar-second-row > :global(div:not(:last-of-type)) {
              margin-right: 0.5rem;
            }

            #style-editor-button {
              display: flex;
              align-items: center;
            }
          `}
        </style>
      </div>
    )
}

Editor.defaultProps = {
  onUpdate: () => {},
  onReset: () => {},
}

export default Editor

