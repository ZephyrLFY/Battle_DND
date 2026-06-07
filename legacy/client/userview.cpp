#include "userview.h"
#include "ui_userview.h"
#include "wideuse.h"

userView::userView(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::userView)
{
    ui->setupUi(this);
    connect(this,SIGNAL(getUsr(QList<QString> &)),udpthread,SLOT(getUsr(QList<QString> &)));
    connect(udpthread,SIGNAL(alluser(QList<QString>&)),this,SLOT(updateTable(QList<QString>&)));
    getUsr();
}

userView::~userView()
{
    disconnect(this,SIGNAL(getUsr(QList<QString> &)),udpthread,SLOT(getUsr(QList<QString> &)));
    disconnect(udpthread,SIGNAL(alluser(QList<QString>&)),this,SLOT(updateTable(QList<QString>&)));
    usrModel->clear();
    delete usrModel;
    delete ui;
}

void userView::getUsr()
{
    QList<QString> text;
    text << "5" << localUser->getName();
    emit getUsr(text);
}

void userView::updateTable(QList<QString> &usrInfo)
{
    rowNum = usrInfo.count("line");
    bool color = false;
    bool isMe = false;
    usrModel = new QStandardItemModel(this);
    usrModel->setColumnCount(27);
    usrModel->setRowCount(rowNum);
    usrModel->setHeaderData(0,Qt::Horizontal,"用户名");
    usrModel->setHeaderData(1,Qt::Horizontal,"胜场");
    usrModel->setHeaderData(2,Qt::Horizontal,"总场数");
    usrModel->setHeaderData(3,Qt::Horizontal,"数量徽章");
    usrModel->setHeaderData(4,Qt::Horizontal,"精英徽章");
    usrModel->setHeaderData(5,Qt::Horizontal,"精灵数量");
    usrModel->setHeaderData(6,Qt::Horizontal,"小精灵1");
    usrModel->setHeaderData(7,Qt::Horizontal,"等级1");
    usrModel->setHeaderData(8,Qt::Horizontal,"经验1");
    usrModel->setHeaderData(9,Qt::Horizontal,"小精灵2");
    usrModel->setHeaderData(10,Qt::Horizontal,"等级2");
    usrModel->setHeaderData(11,Qt::Horizontal,"经验2");
    usrModel->setHeaderData(12,Qt::Horizontal,"小精灵3");
    usrModel->setHeaderData(13,Qt::Horizontal,"等级3");
    usrModel->setHeaderData(14,Qt::Horizontal,"经验3");
    usrModel->setHeaderData(15,Qt::Horizontal,"小精灵4");
    usrModel->setHeaderData(16,Qt::Horizontal,"等级4");
    usrModel->setHeaderData(17,Qt::Horizontal,"经验4");
    usrModel->setHeaderData(18,Qt::Horizontal,"小精灵5");
    usrModel->setHeaderData(19,Qt::Horizontal,"等级5");
    usrModel->setHeaderData(20,Qt::Horizontal,"经验5");
    usrModel->setHeaderData(21,Qt::Horizontal,"小精灵6");
    usrModel->setHeaderData(22,Qt::Horizontal,"等级6");
    usrModel->setHeaderData(23,Qt::Horizontal,"经验6");
    usrModel->setHeaderData(24,Qt::Horizontal,"小精灵7");
    usrModel->setHeaderData(25,Qt::Horizontal,"等级7");
    usrModel->setHeaderData(26,Qt::Horizontal,"经验7");
    int numSum = 0;
    int highSum = 0;
    for(int row = 0; row < rowNum; row++)
    {
        if(usrInfo.at(1) == "1")
            color = true;
        if(usrInfo.at(0) == localUser->getName())
        {
            isMe = true;
            color = false;
        }
        for(int col = 0; col < 28; col++)
        {
            if(usrInfo.at(0) == "line")
            {
                /*计算本行的徽章*/
                switch(numSum)
                {
                case 6:
                case 7:
                {
                    QStandardItem *item1 = new QStandardItem("Gold");
                    item1->setBackground(QBrush(QColor(255,215,0)));
                    usrModel->setItem(row,3,item1);
                    break;
                }
                case 0:
                {
                    QStandardItem *item1 = new QStandardItem("None");
                    usrModel->setItem(row,3,item1);
                    break;
                }
                case 1:
                case 2:
                {
                    QStandardItem *item1 = new QStandardItem("Copper");
                    item1->setBackground(QBrush(QColor(196,112,34)));
                    usrModel->setItem(row,3,item1);
                    break;
                }
                default:
                {
                    QStandardItem *item1 = new QStandardItem("Silver");
                    item1->setBackground(QBrush(QColor(192,192,192)));
                    usrModel->setItem(row,3,item1);
                    break;
                }
                }
                switch(highSum)
                {
                case 6:
                case 7:
                {
                    QStandardItem *item2 = new QStandardItem("Gold");
                    item2->setBackground(QBrush(QColor(255,215,0)));
                    usrModel->setItem(row,4,item2);
                    break;
                }
                case 0:
                {
                    QStandardItem *item2 = new QStandardItem("None");
                    usrModel->setItem(row,4,item2);
                    break;
                }
                case 1:
                case 2:
                {
                    QStandardItem *item2 = new QStandardItem("Copper");
                    item2->setBackground(QBrush(QColor(196,112,34)));
                    usrModel->setItem(row,4,item2);
                    break;
                }
                default:
                {
                    QStandardItem *item2 = new QStandardItem("Silver");
                    item2->setBackground(QBrush(QColor(192,192,192)));
                    usrModel->setItem(row,4,item2);
                    break;
                }
                }
                usrInfo.removeFirst();
                numSum = 0;
                highSum = 0;
                break;
            }
            if(col == 3 || col == 4)
                continue;
            else if(col == 5)
                numSum = usrInfo.at(0).toInt();
            else if(col > 6 && ((col % 3) == 1))
            {
                if(usrInfo.at(0).toInt() == 15)
                    highSum++;
            }
            QStandardItem *item = new QStandardItem(usrInfo.at(0));
            if(col == 0)
            {
                if(color)
                    item->setBackground(QBrush(QColor(153,0,153)));/*紫色表示在线*/
                else if(isMe)
                    item->setBackground(QBrush(QColor(162,205,90)));/*绿色表示当前用户*/
                usrInfo.removeFirst();
            }
            usrModel->setItem(row,col,item);
            usrInfo.removeFirst();
        }
        color = false;
        isMe = false;
    }
    ui->userInfo->setModel(usrModel);
    ui->userInfo->setEditTriggers(QAbstractItemView::NoEditTriggers);
    ui->userInfo->verticalHeader()->setVisible(false);
    ui->userInfo->resizeColumnsToContents();
    ui->userInfo->setSelectionMode(QAbstractItemView::ExtendedSelection);
    ui->userInfo->setSelectionBehavior(QAbstractItemView::SelectItems);
}
