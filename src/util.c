
#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>

#include "util.h"

int int_min(int x, int y){
    return x < y? x: y;
}

int int_max(int x, int y){
    return x > y? x: y;
}

int linear_interpolation(int x0, int x1, int t, int t_max){
    int diff = x1 - x0;
    return x0 + diff * t / t_max;
}

int getln(char buf[], int buf_len){
    if(!fgets(buf, buf_len, stdin)){
        perror("fgets failed");
        return 1;
    }
    buf[strcspn(buf, "\n")] = '\0';
    return 0;
}

char *load_file(const char *filename){
    FILE *f = fopen(filename, "r");
    long f_size;
    char *f_buffer;
    size_t n_read_bytes;
    if(f == NULL){
        fprintf(stderr, "Could not open file: %s\n", filename);
        return NULL;
    }

    fseek(f, 0, SEEK_END);
    f_size = ftell(f);
    fseek(f, 0, SEEK_SET);

    f_buffer = calloc(f_size + 1, 1);
    if(f_buffer == NULL){
        fprintf(stderr, "Could not allocate buffer for file: %s (%li bytes)\n", filename, f_size);
        fclose(f);
        return NULL;
    }
    n_read_bytes = fread(f_buffer, 1, f_size, f);
    fclose(f);
    return f_buffer;
}

bool streq(const char *s1, const char *s2){
    if(s1 == NULL || s2 == NULL)return s1 == s2;
    return strcmp(s1, s2) == 0;
}

size_t strnlen(const char *s, size_t maxlen){
    size_t len = 0;
    while(len < maxlen && s[len] != '\0')len++;
    return len;
}

char *strdup(const char *s1){
    char *s2 = malloc(strlen(s1) + 1);
    if(s2 == NULL)return NULL;
    strcpy(s2, s1);
    return s2;
}

char *strndup(const char *s1, size_t len){
    size_t s_len = strnlen(s1, len);
    char *s2 = malloc(s_len + 1);
    if(s2 == NULL)return NULL;
    strncpy(s2, s1, len);
    s2[s_len] = '\0';
    return s2;
}

void get_spaces(char *spaces, int max_spaces, int n_spaces){
    if(n_spaces > max_spaces){
        fprintf(stderr, "Can't handle %i spaces - max %i\n",
            n_spaces, max_spaces);
        n_spaces = max_spaces;
    }
    for(int i = 0; i < n_spaces; i++)spaces[i] = ' ';
    spaces[n_spaces] = '\0';
}

