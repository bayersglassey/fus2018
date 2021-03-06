
#include <stdio.h>
#include <string.h>

#include "write.h"


void fus_write_str(FILE *f, const char *s){
    fputc('\"', f);
    if(s != NULL){
        char c;
        while(c = *s, c != '\0'){
            if(c == '\n'){
                fputs("\\n", f);
            }else if(c == '\"' || c == '\\'){
                fputc('\\', f);
                fputc(c, f);
            }else{
                fputc(c, f);
            }
            s++;
        }
    }
    fputc('\"', f);
}

void fus_write_str_padded(FILE *f, const char *s, int w){
    int s_len = strlen(s);
    if(s_len + 2 < w){
        for(int i = 0; i < w - s_len - 2; i++)putc(' ', f);
    }
    fus_write_str(f, s);
}

