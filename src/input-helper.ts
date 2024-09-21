import * as core from '@actions/core'
import {Inputs, NoFileOptions} from './constants'
import {UploadInputs, UploadEachInputs} from './upload-inputs'

/**
 * Helper to get all the inputs for the action
 */
export function getInputs(): UploadInputs | UploadEachInputs {
  const name = core.getInput(Inputs.Name)
  const path = core.getInput(Inputs.Path, {required: true})

  const ifNoFilesFound = core.getInput(Inputs.IfNoFilesFound)
  const noFileBehavior: NoFileOptions = NoFileOptions[ifNoFilesFound]
  const includeHiddenFiles = core.getBooleanInput(Inputs.IncludeHiddenFiles)
  const artifactPerFile = core.getBooleanInput(Inputs.ArtifactPerFile)
  const artifactNameRule = core.getInput(Inputs.ArtifactNameRule)

  if (!noFileBehavior) {
    core.setFailed(
      `Unrecognized ${
        Inputs.IfNoFilesFound
      } input. Provided: ${ifNoFilesFound}. Available options: ${Object.keys(
        NoFileOptions
      )}`
    )
  }

  const typedInputs = (
    artifactPerFile: boolean
  ): UploadInputs | UploadEachInputs => {
    if (artifactPerFile) {
      return {
        artifactName: name,
        searchPath: path,
        ifNoFilesFound: noFileBehavior,
        includeHiddenFiles: includeHiddenFiles
      } as UploadInputs
    } else {
      return {
        searchPath: path,
        ifNoFilesFound: noFileBehavior,
        includeHiddenFiles: includeHiddenFiles,
        artifactPerFile: artifactPerFile,
        artifactNameRule: artifactNameRule
      } as UploadEachInputs
    }
  }

  const inputs = typedInputs(artifactPerFile)

  const retentionDaysStr = core.getInput(Inputs.RetentionDays)
  if (retentionDaysStr) {
    inputs.retentionDays = parseInt(retentionDaysStr)
    if (isNaN(inputs.retentionDays)) {
      core.setFailed('Invalid retention-days')
    }
  }

  return inputs
}
