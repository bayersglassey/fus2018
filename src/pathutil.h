#ifndef _FUS_PATHUTIL_H_
#define _FUS_PATHUTIL_H_


int find_file_parent(char *start_path, char *name, int name_len,
    char *path, size_t path_size);


#endif