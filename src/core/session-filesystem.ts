import type { FileSystemApi } from '../commands/system';
import type { Session } from './session';

/** Resolve filesystem operations against the current session and enforce writes centrally. */
export class SessionFileSystem implements FileSystemApi {
  constructor(
    private readonly session: () => Session,
    private readonly beforeWrite: (path: string) => void = () => {},
  ) {}
  directory() {
    return this.session().workingDirectory;
  }
  cd(path: string) {
    this.session().changeDirectory(path);
  }
  list(path = '.') {
    const session = this.session();
    return session.filesystem.list(path, session.workingDirectory);
  }
  stat(path: string) {
    const session = this.session();
    return session.filesystem.stat(path, session.workingDirectory);
  }
  read(path: string) {
    const session = this.session();
    return session.filesystem.readFile(path, session.workingDirectory);
  }
  write(path: string, text: string) {
    this.beforeWrite(path);
    const session = this.session();
    session.filesystem.writeFile(path, text, session.workingDirectory);
  }
  mkdir(path: string) {
    this.beforeWrite(path);
    const session = this.session();
    session.filesystem.mkdir(path, session.workingDirectory);
  }
  remove(path: string) {
    this.beforeWrite(path);
    const session = this.session();
    session.filesystem.removeFile(path, session.workingDirectory);
  }
}
