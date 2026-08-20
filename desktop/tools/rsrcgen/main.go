// rsrcgen — 把 assets/icon.ico 嵌入为 Windows 资源对象 icon_windows.syso。
//
// 输出是一个 COFF 目标文件（.rsrc section），Go 链接器在 Windows 构建时
// 自动合并进 exe：
//   - RT_GROUP_ICON id=3：wails 的窗口/托盘默认图标查找约定（NewIconFrom
//     Resource(hModule, 3) / LoadIconWithResourceID(hModule, RT_ICON=3)），
//     同时 Explorer/任务栏按任一图标组展示 exe 图标；
//   - RT_ICON id=101..：.ico 内的原始 DIB 图像数据。
//
// 重新生成：go run ./tools/rsrcgen（在 desktop 目录下），产物
// desktop/icon_windows.syso 随仓库提交，构建无需额外工具链。
package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

const (
	machineAMD64        = 0x8664
	rsrcCharacteristics = 0x40000040 // INITIALIZED_DATA | MEM_READ
	rtIcon              = 3
	rtGroupIcon         = 14
	groupIconID         = 3
	firstIconID         = 101
)

type icoEntry struct {
	width, height, colors, reserved byte
	planes, bitCount                uint16
	bytesInRes                      uint32
	imageOffset                     uint32
}

type icoFile struct {
	entries []icoEntry
	images  [][]byte
}

func parseICO(path string) (*icoFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) < 6 {
		return nil, fmt.Errorf("ico too small")
	}
	if binary.LittleEndian.Uint16(data[0:2]) != 0 || binary.LittleEndian.Uint16(data[2:4]) != 1 {
		return nil, fmt.Errorf("not an ICO file")
	}
	count := int(binary.LittleEndian.Uint16(data[4:6]))
	ico := &icoFile{}
	for i := 0; i < count; i++ {
		off := 6 + i*16
		if off+16 > len(data) {
			return nil, fmt.Errorf("ico entry %d out of range", i)
		}
		e := icoEntry{
			width:       data[off],
			height:      data[off+1],
			colors:      data[off+2],
			reserved:    data[off+3],
			planes:      binary.LittleEndian.Uint16(data[off+4:]),
			bitCount:    binary.LittleEndian.Uint16(data[off+6:]),
			bytesInRes:  binary.LittleEndian.Uint32(data[off+8:]),
			imageOffset: binary.LittleEndian.Uint32(data[off+12:]),
		}
		if int(e.imageOffset)+int(e.bytesInRes) > len(data) {
			return nil, fmt.Errorf("ico image %d out of range", i)
		}
		ico.entries = append(ico.entries, e)
		img := make([]byte, e.bytesInRes)
		copy(img, data[e.imageOffset:])
		ico.images = append(ico.images, img)
	}
	if count == 0 {
		return nil, fmt.Errorf("ico has no images")
	}
	return ico, nil
}

// dirBuilder 按 4 字节对齐追加资源数据；目录/叶子先占位，最后回填。
type dirBuilder struct {
	buf   []byte
	align int
}

func (b *dirBuilder) alignTo() {
	for len(b.buf)%b.align != 0 {
		b.buf = append(b.buf, 0)
	}
}

func (b *dirBuilder) add(blob []byte) uint32 {
	b.alignTo()
	off := uint32(len(b.buf))
	b.buf = append(b.buf, blob...)
	return off
}

// resourceDirectory 表示一级资源目录（含条目占位，稍后回填）。
type resourceDirectory struct {
	b     *dirBuilder
	pos   int
	ids   []uint32
}

func (b *dirBuilder) newDirectory(ids []uint32) *resourceDirectory {
	b.alignTo()
	d := &resourceDirectory{b: b, pos: len(b.buf)}
	// 资源目录条目必须按 ID 升序（Windows 资源查找按二分搜索实现）。
	d.ids = append([]uint32(nil), ids...)
	sort.Slice(d.ids, func(i, j int) bool { return d.ids[i] < d.ids[j] })
	// 16 字节头 + 每条目 8 字节；头里写 NumberOfIdEntries（offset 14）。
	head := make([]byte, 16)
	binary.LittleEndian.PutUint16(head[14:], uint16(len(d.ids)))
	b.buf = append(b.buf, head...)
	b.buf = append(b.buf, make([]byte, len(d.ids)*8)...)
	return d
}

// setEntryByID 回填 id 对应条目的 OffsetToData；isDir=true 时置高位置位。
func (d *resourceDirectory) setEntryByID(id, target uint32, isDir bool) {
	idx := -1
	for i, v := range d.ids {
		if v == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		panic(fmt.Sprintf("rsrcgen: id %d not in directory", id))
	}
	if isDir {
		target |= 0x80000000
	}
	p := d.pos + 16 + idx*8
	binary.LittleEndian.PutUint32(d.b.buf[p:], id)
	binary.LittleEndian.PutUint32(d.b.buf[p+4:], target)
}

// buildResourceTree 组装 .rsrc 数据（三级目录：类型 → ID → 语言）。
// 返回资源数据与需要链接器重定位的字段位置（IMAGE_RESOURCE_DATA_ENTRY
// 的 OffsetToData 在最终镜像里必须是完整 RVA，对象文件里是 section 相对
// 偏移，靠 COFF 重定位交给链接器转换）。
func buildResourceTree(ico *icoFile) ([]byte, []int) {
	b := &dirBuilder{align: 4}
	n := len(ico.images)

	// 类型层：RT_GROUP_ICON(14)、RT_ICON(3)
	typeDir := b.newDirectory([]uint32{rtGroupIcon, rtIcon})
	// ID 层：组图标 1 个（id=3）；RT_ICON 一个目录含全部 n 个 ID（101..）
	groupIDDir := b.newDirectory([]uint32{groupIconID})
	iconIDs := make([]uint32, n)
	for i := 0; i < n; i++ {
		iconIDs[i] = uint32(firstIconID + i)
	}
	iconsIDDir := b.newDirectory(iconIDs)
	// 语言层：每组 1 个（language 0）
	groupLangDir := b.newDirectory([]uint32{0})
	iconLangDirs := make([]*resourceDirectory, n)
	for i := 0; i < n; i++ {
		iconLangDirs[i] = b.newDirectory([]uint32{0})
	}

	// 数据 blob：组目录 + 各图像
	groupDataOff := b.add(buildGroupIconData(ico))
	iconDataOffs := make([]uint32, n)
	for i, img := range ico.images {
		iconDataOffs[i] = b.add(img)
	}

	// 叶子：IMAGE_RESOURCE_DATA_ENTRY（16 字节），OffsetToData 需要重定位。
	var relocFields []int
	leaf := func(dataOff, size uint32) uint32 {
		b.alignTo()
		p := len(b.buf)
		ent := make([]byte, 16)
		binary.LittleEndian.PutUint32(ent[0:], dataOff)
		binary.LittleEndian.PutUint32(ent[4:], size)
		b.buf = append(b.buf, ent...)
		relocFields = append(relocFields, p) // 字段位置（相对 section 起点）
		return uint32(p)
	}

	groupLangDir.setEntryByID(0, leaf(groupDataOff, uint32(6+16*n)), false)
	groupIDDir.setEntryByID(groupIconID, uint32(groupLangDir.pos), true)
	typeDir.setEntryByID(rtGroupIcon, uint32(groupIDDir.pos), true)

	for i := 0; i < n; i++ {
		iconLangDirs[i].setEntryByID(0, leaf(iconDataOffs[i], uint32(len(ico.images[i]))), false)
		iconsIDDir.setEntryByID(uint32(firstIconID+i), uint32(iconLangDirs[i].pos), true)
	}
	typeDir.setEntryByID(rtIcon, uint32(iconsIDDir.pos), true)
	return b.buf, relocFields
}

// buildGroupIconData 生成 GRPICONDIR：6 字节头 + 每图 16 字节条目。
//
// 实测 Windows（notepad.exe 组资源）的组条目是 16 字节：
//   {w,h,colors,reserved, planes, bitcount, dwBytesInRes(图像字节数),
//    wResID(RT_ICON 资源 ID), 保留}
// 而不是文档里的 14 字节 IMAGE_GRPICONDIRENTRY——LookupIconIdFromDirectoryEx
// 按 16 字节解析并返回 wResID，14 字节格式会导致 LoadImage/LoadIcon 失败。
func buildGroupIconData(ico *icoFile) []byte {
	out := make([]byte, 0, 6+16*len(ico.entries))
	head := make([]byte, 6)
	binary.LittleEndian.PutUint16(head[0:], 0) // reserved
	binary.LittleEndian.PutUint16(head[2:], 1) // type=icon
	binary.LittleEndian.PutUint16(head[4:], uint16(len(ico.entries)))
	out = append(out, head...)
	for i, e := range ico.entries {
		ent := make([]byte, 16)
		ent[0] = e.width
		ent[1] = e.height
		ent[2] = e.colors
		ent[3] = e.reserved
		binary.LittleEndian.PutUint16(ent[4:], e.planes)
		binary.LittleEndian.PutUint16(ent[6:], e.bitCount)
		binary.LittleEndian.PutUint32(ent[8:], uint32(len(ico.images[i]))) // 图像字节数
		binary.LittleEndian.PutUint16(ent[12:], uint16(firstIconID+i))    // RT_ICON 资源 ID
		// ent[14:16] 保留
		out = append(out, ent...)
	}
	return out
}

func main() {
	root := "."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	icoPath := filepath.Join(root, "assets", "icon.ico")
	outPath := filepath.Join(root, "icon_windows.syso")
	ico, err := parseICO(icoPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "parse ico:", err)
		os.Exit(1)
	}
	fmt.Printf("ico: %d images (%d x %d ...)\n", len(ico.entries), ico.entries[0].width, ico.entries[0].height)

	rsrc, relocFields := buildResourceTree(ico)
	numRelocs := len(relocFields)
	numSymbols := 2 // .rsrc section symbol + 1 aux entry

	// 布局：文件头(20) + 节头(40) + 原始数据 + 重定位表 + 符号表
	relocOff := 60 + len(rsrc)
	symOff := relocOff + numRelocs*10
	total := symOff + numSymbols*18

	obj := make([]byte, 0, total)
	// COFF file header
	head := make([]byte, 20)
	binary.LittleEndian.PutUint16(head[0:], machineAMD64)
	binary.LittleEndian.PutUint16(head[2:], 1) // 1 section
	binary.LittleEndian.PutUint32(head[8:], uint32(symOff))
	binary.LittleEndian.PutUint32(head[12:], uint32(numSymbols))
	binary.LittleEndian.PutUint16(head[16:], 0)
	obj = append(obj, head...)
	// section header
	sec := make([]byte, 40)
	copy(sec[0:8], ".rsrc\x00\x00\x00")
	binary.LittleEndian.PutUint32(sec[16:], uint32(len(rsrc))) // SizeOfRawData
	binary.LittleEndian.PutUint32(sec[20:], 60)                 // PointerToRawData
	binary.LittleEndian.PutUint32(sec[24:], uint32(relocOff))   // PointerToRelocations
	binary.LittleEndian.PutUint32(sec[32:], uint32(numRelocs))  // NumberOfRelocations
	binary.LittleEndian.PutUint32(sec[36:], rsrcCharacteristics)
	obj = append(obj, sec...)
	obj = append(obj, rsrc...)

	// 重定位：IMAGE_REL_AMD64_ADDR32NB(3)，指向 .rsrc section 符号（index 0）
	// ——链接器把字段里的 section 相对偏移加上 .rsrc 的 RVA，写回完整 RVA。
	for _, f := range relocFields {
		rel := make([]byte, 10)
		binary.LittleEndian.PutUint32(rel[0:], uint32(f)) // VirtualAddress（对象内偏移）
		binary.LittleEndian.PutUint32(rel[4:], 0)         // SymbolTableIndex
		binary.LittleEndian.PutUint16(rel[8:], 3)         // ADDR32NB
		obj = append(obj, rel...)
	}

	// 符号表：.rsrc section 符号 + section 定义 aux 记录
	sym := make([]byte, 18)
	binary.LittleEndian.PutUint16(sym[10:], 1)        // SectionNumber=1
	sym[16] = 3                                       // IMAGE_SYM_CLASS_STATIC
	sym[17] = 1                                       // 1 aux entry
	obj = append(obj, sym...)
	aux := make([]byte, 18)
	binary.LittleEndian.PutUint32(aux[0:], uint32(len(rsrc))) // section Length
	binary.LittleEndian.PutUint16(aux[4:], uint16(numRelocs)) // NumberOfRelocations
	obj = append(obj, aux...)

	// 字符串表：即使为空也必须存在（4 字节长度头 = 4）。
	strtab := make([]byte, 4)
	binary.LittleEndian.PutUint32(strtab, 4)
	obj = append(obj, strtab...)

	if err := os.WriteFile(outPath, obj, 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "write:", err)
		os.Exit(1)
	}
	fmt.Printf("wrote %s (%d bytes, rsrc %d bytes, %d relocations)\n", outPath, len(obj), len(rsrc), numRelocs)
}
