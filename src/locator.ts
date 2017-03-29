import * as vscode from 'vscode'
import * as path from 'path'
import * as cp from 'child_process'

import {Extension} from './main'

export class Locator {
    extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
    }

    parseSyncTeX(result: string) : any {
        let record = {}
        let started = false
        for (let line of result.split('\n')) {
            if (line.indexOf('SyncTeX result begin') > -1) {
                started = true
                continue
            }
            if (line.indexOf('SyncTeX result end') > -1)
                break
            if (!started)
                continue
            let pos = line.indexOf(':')
            if (pos < 0)
                continue
            let key = line.substr(0, pos).toLowerCase()
            if (key in record)
                continue
            record[line.substr(0, pos).toLowerCase()] = line.substr(pos + 1)
        }
        return record
    }

    syncTeX() {
        let filePath = vscode.window.activeTextEditor.document.uri.fsPath
        if (!this.extension.manager.isTex(filePath)){
            this.extension.logger.addLogMessage(`${filePath} is not a valid LaTeX file.`)
            return
        }
        let position = vscode.window.activeTextEditor.selection.active
        if (!position){
            this.extension.logger.addLogMessage(`Cannot get cursor position: ${position}`)
            return
        }
        let pdfFile = this.extension.manager.tex2pdf(this.extension.manager.rootFile)
        let cmd = `synctex view -i "${position.line + 1}:${position.character + 1}:${filePath}" -o "${pdfFile}"`
        this.extension.logger.addLogMessage(`Executing ${cmd}`)
        cp.exec(cmd, {cwd: path.dirname(pdfFile)}, (err, stdout, stderr) => {
            if (err)
                this.extension.logger.addLogMessage(`Cannot synctex: ${err}, ${stderr}`)
            else
                this.extension.viewer.syncTeX(pdfFile, this.parseSyncTeX(stdout))
        })
    }

    locate(data: any, pdfPath: string) {
        let cmd = `synctex edit -o "${data.page}:${data.pos[0]}:${data.pos[1]}:${pdfPath}"`
        this.extension.logger.addLogMessage(`Executing ${cmd}`)
        cp.exec(cmd, {cwd: path.dirname(pdfPath)}, (err, stdout, stderr) => {
            if (err) {
                this.extension.logger.addLogMessage(`Cannot reverse synctex: ${err}, ${stderr}`)
                return
            }
            let record = this.parseSyncTeX(stdout)
            if (!('input' in record)) {
                this.extension.logger.addLogMessage(`Reverse synctex returned null file: ${record}`)
                return
            }
            let row = record.line - 1
            let col = record.column < 0 ? 0 : record.column
            let pos = new vscode.Position(row, col);
            let filePath = path.resolve(record.input.replace(/(\r\n|\n|\r)/gm, ''))

            this.extension.logger.addLogMessage(`SyncTeX to file ${filePath}`)
            vscode.workspace.openTextDocument(filePath).then((doc) => {
                vscode.window.showTextDocument(doc).then((editor) => {
                    editor.selection = new vscode.Selection(pos, pos);
                    vscode.commands.executeCommand("revealLine", {lineNumber: row, at: 'center'});
                })
            })
        })
    }
}