import * as core from '@actions/core'
import artifact, {
  UploadArtifactOptions,
  ArtifactNotFoundError
} from '@actions/artifact'
import {findFilesToUpload} from '../shared/search'
import {getInputs} from './input-helper'
import {NoFileOptions} from './constants'
import {UploadInputs, UploadEachInputs} from './upload-inputs'
import {uploadArtifact} from '../shared/upload-artifact'

import * as path from 'path'

async function deleteArtifactIfExists(artifactName: string): Promise<void> {
  try {
    await artifact.deleteArtifact(artifactName)
  } catch (error) {
    if (error instanceof ArtifactNotFoundError) {
      core.debug(`Skipping deletion of '${artifactName}', it does not exist`)
      return
    }

    // Best effort, we don't want to fail the action if this fails
    core.debug(`Unable to delete artifact: ${(error as Error).message}`)
  }
}


export async function run(): Promise<void> {
  const inputs: UploadInputs | UploadEachInputs = getInputs()
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

    const artifactNameOpt = inputs.hasOwnProperty('artifactName')
    const singleArtifactName = artifactNameOpt ? inputs['artifactName'] : 'artifact'

    if (inputs.overwrite) {
      await deleteArtifactIfExists(singleArtifactName)
    }

    const options: UploadArtifactOptions = {}
    if (inputs.retentionDays) {
      options.retentionDays = inputs.retentionDays
    }

    if (typeof inputs.compressionLevel !== 'undefined') {
      options.compressionLevel = inputs.compressionLevel
    }

    const artifactPerFileOpt = inputs.hasOwnProperty('artifactPerFile')
    const artifactPerFile = artifactPerFileOpt ? inputs['artifactPerFile'] : false

    if (!artifactPerFile) {
      await uploadArtifact(
        singleArtifactName,
        searchResult.filesToUpload,
        searchResult.rootDirectory,
        options
      )
    } else {
      const filesToUpload = searchResult.filesToUpload

      const artifactNameRule = inputs['artifactNameRule']
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]

        const pathObject = Object.assign({}, path.parse(file))
        const pathBase = pathObject.base
        const pathRoot = searchResult.rootDirectory
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

        if (artifactName.includes(path.sep)) {
          core.warning(`${artifactName} includes ${path.sep}`)
          artifactName = artifactName.split(path.sep).join('_')
        }
        if (artifactName.includes(':')) {
          core.warning(`${artifactName} includes :`)
          artifactName = artifactName.split(':').join('_')
        }

        await uploadArtifact(
          artifactName,
          [file],
          searchResult.rootDirectory,
          options
        )
      }
    }
  }
}
