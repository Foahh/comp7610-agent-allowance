import { readConfig } from "@repo/utils/config"

import { createInstallation } from "./installation.ts"

const installation = createInstallation(readConfig())
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    installation.close()
  })
}
export default installation.app
