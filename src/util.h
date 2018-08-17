
#ifndef _FUS_UTIL_H_
#define _FUS_UTIL_H_

#define ERR_INFO() fprintf(stderr, "%s:%s:%i: ", \
    __FILE__, __func__, __LINE__)

#define MAX_SPACES 256

int int_min(int x, int y);
int int_max(int x, int y);
int linear_interpolation(int x0, int x1, int t, int t_max);
int getln(char buf[], int buf_len);
char *load_file(const char *filename);
bool streq(const char *s1, const char *s2);
size_t strnlen(const char *s, size_t maxlen);
char *strdup(const char *s1);
char *strndup(const char *s1, size_t len);
void get_spaces(char *spaces, int max_spaces, int n_spaces);

#endif
