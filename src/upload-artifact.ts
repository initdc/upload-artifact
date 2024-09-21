import * as core from '@actions/core'
import {create, UploadOptions} from '@actions/artifact'
import {findFilesToUpload} from './search'
import {getInputs} from './input-helper'
import {NoFileOptions} from './constants'
import * as path from 'path'

async function run(): Promise<void> {
  try {
    const inputs = getInputs()
    const searchResult = await findFilesToUpload(
      inputs.searchPath,
      inputs.includeHiddenFiles
    )
    if (searchResult.filesToUpload.length === 0) {
      // No files were found, different use cases warrant different types of behavior if nothing is found
      switch (inputs.ifNoFilesFound) {
        case NoFileOptions.warn: {
          core.warning(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`
          )
          break
        }
        case NoFileOptions.error: {
          core.setFailed(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`
          )
          break
        }
        case NoFileOptions.ignore: {
          core.info(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`
          )
          break
        }
      }
    } else {
      const s = searchResult.filesToUpload.length === 1 ? '' : 's'
      core.info(
        `With the provided path, there will be ${searchResult.filesToUpload.length} file${s} uploaded`
      )
      core.debug(`Root artifact directory is ${searchResult.rootDirectory}`)

      if (searchResult.filesToUpload.length > 10000) {
        core.warning(
          `There are over 10,000 files in this artifact, consider creating an archive before upload to improve the upload performance.`
        )
      }

      const artifactClient = create()
      const options: UploadOptions = {
        continueOnError: false
      }
      if (inputs.retentionDays) {
        options.retentionDays = inputs.retentionDays
      }

      const artifactNameOpt = inputs['artifactName']
      const singleArtifactName = artifactNameOpt
        ? inputs['artifactName']
        : 'artifact'

      const artifactPerFileOpt = inputs['artifactPerFile']
      const artifactPerFile = artifactPerFileOpt
        ? inputs['artifactPerFile']
        : false

      let githubWorkspacePath = process.env['GITHUB_WORKSPACE'] || undefined
      if (!githubWorkspacePath) {
        core.warning('GITHUB_WORKSPACE not defined')
      } else {
        githubWorkspacePath = path.resolve(githubWorkspacePath)
        core.info(`GITHUB_WORKSPACE = '${githubWorkspacePath}'`)
      }

      const rootDirectory = searchResult.rootDirectory

      if (!artifactPerFile) {
        const uploadResponse = await artifactClient.uploadArtifact(
          singleArtifactName,
          searchResult.filesToUpload,
          searchResult.rootDirectory,
          options
        )

        if (uploadResponse.failedItems.length > 0) {
          core.setFailed(
            `An error was encountered when uploading ${uploadResponse.artifactName}. There were ${uploadResponse.failedItems.length} items that failed to upload.`
          )
        } else {
          core.info(
            `Artifact ${uploadResponse.artifactName} has been successfully uploaded!`
          )
        }
      } else {
        const filesToUpload = searchResult.filesToUpload
        const SuccessedItems: string[] = []
        const FailedItems: string[] = []

        const artifactNameRule = inputs['artifactNameRule']
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i]

          const pathObject = Object.assign({}, path.parse(file))
          const pathBase = pathObject.base
          const pathRoot = githubWorkspacePath
            ? githubWorkspacePath
            : path.parse(rootDirectory).dir
          pathObject.root = pathRoot

          pathObject['path'] = file.slice(
            pathRoot.length,
            file.length - path.sep.length - pathBase.length
          )

          let artifactName = artifactNameRule
          for (const key of Object.keys(pathObject)) {
            const re = `$\{${key}}`
            if (artifactNameRule.includes(re)) {
              const value = pathObject[key] || ''
              artifactName = artifactName.replace(re, value)
            }
          }

          if (artifactName.startsWith(path.sep)) {
            core.warning(`${artifactName} startsWith ${path.sep}`)
            artifactName = artifactName.slice(path.sep.length)
          }
          if (artifactName.includes(':')) {
            core.warning(`${artifactName} includes :`)
            artifactName = artifactName.split(':').join('-')
          }
          if (artifactName.includes(path.sep)) {
            core.warning(`${artifactName} includes ${path.sep}`)
            artifactName = artifactName.split(path.sep).join('_')
          }

          const artifactItemExist = SuccessedItems.includes(artifactName)
          if (artifactItemExist) {
            const oldArtifactName = artifactName
            core.warning(`${artifactName} artifact alreay exist`)
            artifactName = `${i}__${artifactName}`
            core.warning(`${oldArtifactName} => ${artifactName}`)
          }

          const uploadResponse = await artifactClient.uploadArtifact(
            artifactName,
            [file],
            rootDirectory,
            options
          )
          if (uploadResponse.failedItems.length > 0) {
            FailedItems.push(artifactName)
          } else {
            SuccessedItems.push(artifactName)
          }
        }

        if (FailedItems.length > 0) {
          let errMsg = `${FailedItems.length} artifacts failed to upload, they were:\n`
          errMsg += FailedItems.join('\n')
          core.setFailed(errMsg)
        }
        if (SuccessedItems.length > 0) {
          let infoMsg = `${SuccessedItems.length} artifacts has been successfully uploaded! They were:\n`
          infoMsg += SuccessedItems.join('\n')
          core.info(infoMsg)
        }
      }
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}

run()
