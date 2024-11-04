import {EventEmitter} from 'events';

export class TypedEventEmitter<T> extends EventEmitter {
    override on<K extends keyof T & string>(event: K, listener: (arg: T[K]) => void): this {
        return super.on(event, listener);
    }

    override emit<K extends keyof T & string>(event: K, arg: T[K]): boolean {
        return super.emit(event, arg);
    }

    override off<K extends keyof T & string>(event: K, listener: (arg: T[K]) => void): this {
        return super.off(event, listener);
    }

    override once<K extends keyof T & string>(event: K, listener: (arg: T[K]) => void): this {
        return super.once(event, listener);
    }

    override addListener<K extends keyof T & string>(event: K, listener: (arg: T[K]) => void): this {
        return super.addListener(event, listener);
    }

    override removeListener<K extends keyof T & string>(event: K, listener: (arg: T[K]) => void): this {
        return super.removeListener(event, listener);
    }
}