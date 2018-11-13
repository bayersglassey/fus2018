#ifndef _FUS_UTIL_H_
#define _FUS_UTIL_H_

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

char *load_file(const char *filename);
char *fus_write_long_int(char *buffer, size_t buffer_size, long int i);

#endif