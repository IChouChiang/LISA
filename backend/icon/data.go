package icon

import "encoding/base64"

func Data() []byte {
	// Simple 16x16 green dot PNG
	const data = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABISURBVDhPY3wQ9/9/GiYGYgG6AkaGf6S6gJGRkSGEgWEA3QKMDP+JdQEjIyNDCANxA/4T6wJGIAYwMjKEMDAMoF2AkZEhhIEhAADl6A4iW5736gAAAABJRU5ErkJggg=="
	decoded, _ := base64.StdEncoding.DecodeString(data)
	return decoded
}
