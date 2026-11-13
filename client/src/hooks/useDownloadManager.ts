import { useEffect, useState } from 'react'
import type { JobRecord } from '../lib/jobTypes'
import { downloadManager } from '../services/downloadManager'

export function useDownloadManager() {
  const [jobs, setJobs] = useState<JobRecord[]>(() => downloadManager.getJobs())

  useEffect(() => {
    return downloadManager.subscribe((updatedJobs) => {
      setJobs([...updatedJobs])
    })
  }, [])

  const activeJobs = jobs.filter(
    (j) =>
      j.status === 'created' ||
      j.status === 'queued' ||
      j.status === 'fetching_metadata' ||
      j.status === 'downloading' ||
      j.status === 'post_processing' ||
      j.status === 'packaging' ||
      j.status === 'transferring' ||
      j.client_transfer_status === 'saving',
  )

  const readyJobs = jobs.filter(
    (j) => j.status === 'ready' && j.client_transfer_status !== 'saved',
  )

  return {
    jobs,
    activeJobs,
    readyJobs,
    activeCount: activeJobs.length,
    startDownloadJob: downloadManager.startDownloadJob.bind(downloadManager),
    startTrimJob: downloadManager.startTrimJob.bind(downloadManager),
    startPlaylistJob: downloadManager.startPlaylistJob.bind(downloadManager),
    cancelJob: downloadManager.cancelJob.bind(downloadManager),
    retryJob: downloadManager.retryJob.bind(downloadManager),
    saveFileToDevice: downloadManager.saveFileToDevice.bind(downloadManager),
    dismissJob: downloadManager.dismissJob.bind(downloadManager),
    clearCompleted: downloadManager.clearCompleted.bind(downloadManager),
    getJob: downloadManager.getJob.bind(downloadManager),
  }
}

