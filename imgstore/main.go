// imgstore: 轻量图片对象存储服务（HTTP API + 静态外链直读）
//
// 设计目标（配合 Moeflow 定制版 REMOTE_HTTP 存储驱动）：
//   - Docker 承载，Go 单二进制，镜像约 8MB，常驻内存 < 20MB
//   - 写操作（PUT/DELETE/LIST）需 X-Api-Key 鉴权；读操作（GET/HEAD）匿名直读
//   - 文件按 <prefix>/<name> 平铺存放于数据目录，支持进程内列表缓存（60s）
//
// 环境变量：
//   IMGSTORE_API_KEY   写操作鉴权密钥（必填，默认空=禁止写）
//   IMGSTORE_DATA_DIR  数据目录（默认 ./data）
//   IMGSTORE_LISTEN    监听地址（默认 :8080）
//   IMGSTORE_MAX_BODY  单文件最大字节（默认 1GB）
package main

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const listCacheTTL = 60 * time.Second

type Server struct {
	dataDir string
	apiKey  string
	maxBody int64

	mu        sync.Mutex
	listCache map[string]*listCacheEntry
}

type listCacheEntry struct {
	names map[string]struct{}
	ts    time.Time
}

func NewServer(dataDir, apiKey string, maxBody int64) *Server {
	_ = os.MkdirAll(dataDir, 0o755)
	return &Server{
		dataDir:   dataDir,
		apiKey:    apiKey,
		maxBody:   maxBody,
		listCache: map[string]*listCacheEntry{},
	}
}

// safeJoin 校验并拼接 prefix/name，禁止路径穿越
func (s *Server) safeJoin(prefix, name string) (string, bool) {
	if strings.Contains(prefix, "..") || strings.Contains(name, "..") ||
		strings.Contains(prefix, "/") || strings.HasPrefix(name, "/") ||
		strings.Contains(name, "/") {
		return "", false
	}
	return filepath.Join(s.dataDir, prefix, name), true
}

func (s *Server) auth(r *http.Request) bool {
	if s.apiKey == "" {
		return false
	}
	got := r.Header.Get("X-Api-Key")
	return subtle.ConstantTimeCompare([]byte(got), []byte(s.apiKey)) == 1
}

func (s *Server) requireAuth(w http.ResponseWriter, r *http.Request) bool {
	if !s.auth(r) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return false
	}
	return true
}

func (s *Server) invalidateCache(prefix string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k := range s.listCache {
		if strings.HasPrefix(k, prefix+"/") {
			delete(s.listCache, k)
		}
	}
}

// listNames 返回某前缀下所有文件名（带缓存）
func (s *Server) listNames(prefix string) map[string]struct{} {
	cacheKey := prefix + "/"
	s.mu.Lock()
	if e, ok := s.listCache[cacheKey]; ok && time.Since(e.ts) < listCacheTTL {
		s.mu.Unlock()
		return e.names
	}
	s.mu.Unlock()

	dir := filepath.Join(s.dataDir, prefix)
	entries, err := os.ReadDir(dir)
	names := map[string]struct{}{}
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				names[e.Name()] = struct{}{}
			}
		}
	}

	s.mu.Lock()
	s.listCache[cacheKey] = &listCacheEntry{names: names, ts: time.Now()}
	s.mu.Unlock()
	return names
}

func (s *Server) handlePut(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	prefix, name, ok := parseWritePath(r.URL.Path)
	if !ok {
		http.Error(w, `{"error":"bad path: use /put/<prefix>/<name>"}`, http.StatusBadRequest)
		return
	}
	full, ok := s.safeJoin(prefix, name)
	if !ok {
		http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
		return
	}
	_ = os.MkdirAll(filepath.Dir(full), 0o755)
	f, err := os.OpenFile(full, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		http.Error(w, `{"error":"open failed"}`, http.StatusInternalServerError)
		return
	}
	n, err := io.Copy(f, io.LimitReader(r.Body, s.maxBody+1))
	cerr := f.Close()
	if err != nil || cerr != nil || n > s.maxBody {
		_ = os.Remove(full)
		if n > s.maxBody {
			http.Error(w, `{"error":"file too large"}`, http.StatusRequestEntityTooLarge)
		} else {
			http.Error(w, `{"error":"write failed"}`, http.StatusInternalServerError)
		}
		return
	}
	s.invalidateCache(prefix)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "size": n, "path": prefix + "/" + name})
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	prefix, name, ok := parseWritePath(r.URL.Path)
	if !ok {
		http.Error(w, `{"error":"bad path: use /delete/<prefix>/<name>"}`, http.StatusBadRequest)
		return
	}
	full, ok := s.safeJoin(prefix, name)
	if !ok {
		http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
		return
	}
	err := os.Remove(full)
	if err != nil && !os.IsNotExist(err) {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}
	s.invalidateCache(prefix)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	prefix := strings.TrimPrefix(r.URL.Path, "/list/")
	prefix = strings.TrimSuffix(prefix, "/")
	if prefix == "" || strings.Contains(prefix, "..") {
		http.Error(w, `{"error":"bad prefix"}`, http.StatusBadRequest)
		return
	}
	names := s.listNames(prefix)
	arr := make([]string, 0, len(names))
	for n := range names {
		arr = append(arr, n)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"names": arr})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if !s.requireAuth(w, r) {
		return
	}
	var total, files int64
	_ = filepath.Walk(s.dataDir, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			files++
			total += info.Size()
		}
		return nil
	})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"files": files,
		"bytes": total,
		"dir":   s.dataDir,
	})
}

// handleRead 匿名直读：/files/<prefix>/<name>
func (s *Server) handleRead(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/files/")
	idx := strings.Index(rest, "/")
	if idx <= 0 {
		http.NotFound(w, r)
		return
	}
	prefix, name := rest[:idx], rest[idx+1:]
	full, ok := s.safeJoin(prefix, name)
	if !ok {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, full)
}

// parseWritePath: /put/<prefix>/<name> 或 /delete/<prefix>/<name>
func parseWritePath(p string) (prefix, name string, ok bool) {
	parts := strings.Split(strings.TrimPrefix(p, "/"), "/")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return "", "", false
	}
	return parts[1], parts[2], true
}

func main() {
	dataDir := os.Getenv("IMGSTORE_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	apiKey := os.Getenv("IMGSTORE_API_KEY")
	listen := os.Getenv("IMGSTORE_LISTEN")
	if listen == "" {
		listen = ":8080"
	}
	maxBody := int64(1 << 30) // 1GB
	if v := os.Getenv("IMGSTORE_MAX_BODY"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			maxBody = n
		}
	}

	s := NewServer(dataDir, apiKey, maxBody)
	mux := http.NewServeMux()
	mux.HandleFunc("/put/", s.handlePut)
	mux.HandleFunc("/delete/", s.handleDelete)
	mux.HandleFunc("/list/", s.handleList)
	mux.HandleFunc("/stats", s.handleStats)
	mux.HandleFunc("/files/", s.handleRead)
	log.Printf("imgstore listening on %s data=%s apiKey=%v", listen, dataDir, apiKey != "")
	if err := http.ListenAndServe(listen, mux); err != nil {
		log.Fatal(err)
	}
}
